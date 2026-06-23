import * as Comlink from "comlink";
import { load } from "../../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from "../../../java/build/generated/teavm/wasm-gc/java.wasm?url";
import { openJar } from "../../utils/Jar";
import type { ClassFilePath } from "../../utils/Names";
import { crc32 } from "./crc32";
import type { ZipEntryData } from "./zip";

export interface RemapClassJob {
    sourcePath: ClassFilePath;
    targetPath: ClassFilePath;
}

export interface RemapWorkerResult extends ZipEntryData {
}

export class RemapWorker {
    #remapper: Remapper | null = null;

    async getRemapper(): Promise<Remapper> {
        if (!this.#remapper) {
            try {
                const teavm = await load(indexerWasm);
                this.#remapper = teavm.exports as Remapper;
            } catch (e) {
                console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
                this.#remapper = await import("../../../java/build/generated/teavm/js/java.js") as unknown as Remapper;
            }
        }

        return this.#remapper;
    }

    async getObfToDeobf(mappingsBlob: Blob): Promise<Map<string, string>> {
        const remapper = await this.getRemapper();
        remapper.loadMappings(await mappingsBlob.arrayBuffer());
        return remapper.getObfToDeobf();
    }

    async remapClasses(
        jarName: string,
        jarBlob: Blob,
        mappingsBlob: Blob,
        jobs: RemapClassJob[],
        stateBuffer: SharedArrayBuffer,
        batchSize: number,
        logger?: (count: number) => Promise<void> | void,
    ): Promise<RemapWorkerResult[]> {
        const remapper = await this.getRemapper();
        remapper.loadMappings(await mappingsBlob.arrayBuffer());

        const jar = await openJar(jarName, jarBlob);
        const state = new Uint32Array(stateBuffer);
        const results: RemapWorkerResult[] = [];
        const logPromises: Promise<void>[] = [];

        while (true) {
            const start = Atomics.add(state, 0, batchSize);
            if (start >= jobs.length) break;

            let completed = 0;
            const end = Math.min(start + batchSize, jobs.length);

            for (let i = start; i < end; i++) {
                const job = jobs[i];
                const entry = jar.entries[job.sourcePath];
                if (!entry) {
                    console.warn(`Class entry not found during remap: ${job.sourcePath}`);
                    completed++;
                    continue;
                }

                const remappedBytes = toUint8Array(remapper.remapEntry(toArrayBuffer(await entry.bytes())));
                const compressedBytes = await compressClass(remappedBytes);

                results.push({
                    name: job.targetPath,
                    bytes: compressedBytes.bytes,
                    crc32: crc32(remappedBytes),
                    uncompressedSize: remappedBytes.length,
                    compressionMethod: compressedBytes.compressionMethod,
                });
                completed++;
            }

            if (logger && completed > 0) {
                logPromises.push(Promise.resolve(logger(completed)));
            }
        }

        await Promise.all(logPromises);
        return results;
    }
}

async function compressClass(bytes: Uint8Array<ArrayBuffer>): Promise<{ bytes: Uint8Array<ArrayBuffer>, compressionMethod: 0 | 8; }> {
    if (typeof CompressionStream !== "function") {
        return { bytes, compressionMethod: 0 };
    }

    try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
        const blob = await new Response(stream).blob();
        return {
            bytes: new Uint8Array(await blob.arrayBuffer()),
            compressionMethod: 8,
        };
    } catch (error) {
        console.warn("Failed to deflate remapped class, storing uncompressed", error);
        return { bytes, compressionMethod: 0 };
    }
}

function toUint8Array(bytes: Int8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return copy;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return copy.buffer;
}

interface Remapper {
    loadMappings(data: ArrayBufferLike): void;
    remapEntry(classData: ArrayBufferLike): Int8Array;
    getObfToDeobf(): Map<string, string>;
}

Comlink.expose(new RemapWorker());
