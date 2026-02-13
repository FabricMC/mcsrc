import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from '../../java/build/generated/teavm/wasm-gc/java.wasm?url';
import { openJar, type Jar } from "../utils/Jar.js";
import type { ReferenceKey, ReferenceString } from "./JarIndex.js";

export type ClassDataString = `${string}|${string}|${number}|${string}`;

let indexerFunc: Indexer | null = null;

const getIndexer = async (): Promise<Indexer> => {
    if (!indexerFunc) {
        try {
            const teavm = await load(indexerWasm);
            indexerFunc = teavm.exports as Indexer;
        } catch (e) {
            console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
            indexerFunc = await import("../../java/build/generated/teavm/js/java.js") as unknown as Indexer;
        }
    }
    return indexerFunc;
};

let jar: Jar | null = null;

export const setWorkerJar = async (name: string, blob: Blob | null) => {
    if (!blob) {
        jar = null;
        return;
    }

    jar = await openJar(name, blob);
};

export const indexBatch = async (classNames: string[]): Promise<void> => {
    if (!jar) {
        throw new Error("Jar not set in worker");
    }

    const currentJar = jar; // Capture for closure
    const arrayBufferPromises = classNames.map(async className => {
        const entry = currentJar.entries[className];
        const data = await entry.blob();
        return data.arrayBuffer();
    });

    const indexer = await getIndexer();

    for (const arrayBuffer of arrayBufferPromises) {
        indexer.index(await arrayBuffer);
    }
};

export const getReference = async (key: ReferenceKey): Promise<[ReferenceString]> => {
    const indexer = await getIndexer();
    return indexer.getReference(key);
};

export const getReferenceSize = async (): Promise<number> => {
    const indexer = await getIndexer();
    return indexer.getReferenceSize();
};

export const getBytecode = async (classData: ArrayBufferLike[]): Promise<string> => {
    const indexer = await getIndexer();
    return indexer.getBytecode(classData);
};

export const getClassData = async (): Promise<ClassDataString[]> => {
    const indexer = await getIndexer();
    return indexer.getClassData();
};

interface Indexer {
    index(data: ArrayBufferLike): void;
    getReference(key: ReferenceKey): [ReferenceString];
    getReferenceSize(): number;
    getBytecode(classData: ArrayBufferLike[]): string;
    getClassData(): ClassDataString[];
}
