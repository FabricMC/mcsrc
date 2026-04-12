import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from '../../java/build/generated/teavm/wasm-gc/java.wasm?url';
import { openJar, type Jar } from "../utils/Jar.js";
import type { ReferenceKey, ReferenceString } from "./JarIndex.js";

export type ClassDataString = `${string}|${string}|${number}|${string}`;

export class JarIndexWorker {
    #indexerFunc: Indexer | null = null;
    #jar: Jar | null = null;

    getIndexer = async (): Promise<Indexer> => {
        if (!this.#indexerFunc) {
            try {
                const teavm = await load(indexerWasm);
                this.#indexerFunc = teavm.exports as Indexer;
            } catch (e) {
                console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
                this.#indexerFunc = await import("../../java/build/generated/teavm/js/java.js") as unknown as Indexer;
            }
        }
        return this.#indexerFunc;
    };

    setWorkerJar = async (name: string, blob: Blob | null) => {
        if (!blob) {
            this.#jar = null;
            return;
        }

        this.#jar = await openJar(name, blob);
    };

    indexBatch = async (classNames: string[]): Promise<void> => {
        if (!this.#jar) {
            throw new Error("Jar not set in worker");
        }

        const currentJar = this.#jar; // Capture for closure
        const arrayBufferPromises = classNames.map(async className => {
            const entry = currentJar.entries[className];
            const data = await entry.blob();
            return data.arrayBuffer();
        });

        const indexer = await this.getIndexer();

        for (const arrayBuffer of arrayBufferPromises) {
            indexer.index(await arrayBuffer);
        }
    };

    getReference = async (key: ReferenceKey): Promise<[ReferenceString]> => {
        const indexer = await this.getIndexer();
        return indexer.getReference(key);
    };

    getReferenceSize = async (): Promise<number> => {
        const indexer = await this.getIndexer();
        return indexer.getReferenceSize();
    };

    getBytecode = async (classData: ArrayBufferLike[]): Promise<string> => {
        const indexer = await this.getIndexer();
        return indexer.getBytecode(classData);
    };

    getClassData = async (): Promise<ClassDataString[]> => {
        const indexer = await this.getIndexer();
        return indexer.getClassData();
    };
}

interface Indexer {
    index(data: ArrayBufferLike): void;
    getReference(key: ReferenceKey): [ReferenceString];
    getReferenceSize(): number;
    getBytecode(classData: ArrayBufferLike[]): string;
    getClassData(): ClassDataString[];
}
