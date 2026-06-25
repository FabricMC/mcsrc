import * as Comlink from "comlink";
import { load } from "../../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from "../../../java/build/generated/teavm/wasm-gc/java.wasm?url";
import { openJar } from "../../utils/Jar";
import type { ClassFilePath } from "../../utils/Names";
import { crc32 } from "./crc32";
import type { ZipEntryData } from "./zip";

const COMPRESS_REMAPPED_CLASSES = false;

export interface RemapClassJob {
    sourcePath: ClassFilePath;
    targetPath: ClassFilePath;
}

export interface RemapWorkerResult extends ZipEntryData {
}

export interface RemapWorkerStats {
    classes: number;
    loadMappingsMs: number;
    openJarMs: number;
    readMs: number;
    remapMs: number;
    crcMs: number;
    compressMs: number;
    compressedClasses: number;
    storedClasses: number;
    uncompressedBytes: number;
    outputBytes: number;
}

export interface RemapIndex {
    classData: string[];
    memberData: string[];
}

export interface RemapWorkerBatchResult {
    entries: RemapWorkerResult[];
    stats: RemapWorkerStats;
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

    dispose(): void {
        this.#remapper?.clearRemapperState();
        this.#remapper = null;
    }

    async buildRemapIndex(
        jarName: string,
        jarBlob: Blob,
        sourcePaths: ClassFilePath[],
        stateBuffer: SharedArrayBuffer,
        batchSize: number,
        logger?: (count: number) => Promise<void> | void,
    ): Promise<RemapIndex> {
        const remapper = await this.getRemapper();
        const jar = await openJar(jarName, jarBlob);
        const state = new Uint32Array(stateBuffer);
        const logPromises: Promise<void>[] = [];

        remapper.clearIndex();

        while (true) {
            const start = Atomics.add(state, 0, batchSize);
            if (start >= sourcePaths.length) break;

            let completed = 0;
            const end = Math.min(start + batchSize, sourcePaths.length);

            for (let i = start; i < end; i++) {
                const sourcePath = sourcePaths[i];
                const entry = jar.entries[sourcePath];

                if (!entry) {
                    console.warn(`Class entry not found during remap index: ${sourcePath}`);
                    completed++;
                    continue;
                }

                remapper.indexRemapData(toArrayBuffer(await entry.bytes()));
                completed++;
            }

            if (logger && completed > 0) {
                logPromises.push(Promise.resolve(logger(completed)));
            }
        }

        await Promise.all(logPromises);

        const index = {
            classData: remapper.getClassData(),
            memberData: remapper.getMemberData(),
        };

        remapper.clearIndex();
        return index;
    }

    async remapClasses(
        jarName: string,
        jarBlob: Blob,
        mappingsBlob: Blob,
        remapIndex: RemapIndex,
        jobs: RemapClassJob[],
        stateBuffer: SharedArrayBuffer,
        batchSize: number,
        logger?: (count: number) => Promise<void> | void,
    ): Promise<RemapWorkerBatchResult> {
        const remapper = await this.getRemapper();
        const stats: RemapWorkerStats = {
            classes: 0,
            loadMappingsMs: 0,
            openJarMs: 0,
            readMs: 0,
            remapMs: 0,
            crcMs: 0,
            compressMs: 0,
            compressedClasses: 0,
            storedClasses: 0,
            uncompressedBytes: 0,
            outputBytes: 0,
        };

        try {
            let time = performance.now();
            remapper.loadMappings(await mappingsBlob.arrayBuffer());
            remapper.loadRemapIndex(remapIndex.classData, remapIndex.memberData);
            stats.loadMappingsMs = performance.now() - time;

            time = performance.now();
            const jar = await openJar(jarName, jarBlob);
            stats.openJarMs = performance.now() - time;

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

                    time = performance.now();
                    const classBytes = await entry.bytes();
                    stats.readMs += performance.now() - time;

                    time = performance.now();
                    const remappedBytes = toUint8Array(remapper.remapEntry(toArrayBuffer(classBytes)));
                    stats.remapMs += performance.now() - time;

                    time = performance.now();
                    const classCrc32 = crc32(remappedBytes);
                    stats.crcMs += performance.now() - time;

                    time = performance.now();
                    const outputBytes = await encodeClass(remappedBytes);
                    stats.compressMs += performance.now() - time;

                    results.push({
                        name: job.targetPath,
                        bytes: outputBytes.bytes,
                        crc32: classCrc32,
                        uncompressedSize: remappedBytes.length,
                        compressionMethod: outputBytes.compressionMethod,
                    });
                    stats.classes++;
                    stats.uncompressedBytes += remappedBytes.length;
                    stats.outputBytes += outputBytes.bytes.length;
                    if (outputBytes.compressionMethod === 8) {
                        stats.compressedClasses++;
                    } else {
                        stats.storedClasses++;
                    }
                    completed++;
                }

                if (logger && completed > 0) {
                    logPromises.push(Promise.resolve(logger(completed)));
                }
            }

            await Promise.all(logPromises);
            return { entries: results, stats };
        } finally {
            remapper.clearRemapperState();
        }
    }
}

async function encodeClass(bytes: Uint8Array<ArrayBuffer>): Promise<{ bytes: Uint8Array<ArrayBuffer>, compressionMethod: 0 | 8; }> {
    if (!COMPRESS_REMAPPED_CLASSES || typeof CompressionStream !== "function") {
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
    index(data: ArrayBufferLike): void;
    indexRemapData(data: ArrayBufferLike): void;
    loadMappings(data: ArrayBufferLike): void;
    clearIndex(): void;
    clearRemapperState(): void;
    remapEntry(classData: ArrayBufferLike): Int8Array;
    getObfToDeobf(): Map<string, string>;
    getClassData(): string[];
    getMemberData(): string[];
    loadRemapIndex(classData: string[], memberData: string[]): void;
}

Comlink.expose(new RemapWorker());
