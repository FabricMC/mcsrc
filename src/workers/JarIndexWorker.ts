import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from '../../java/build/generated/teavm/wasm-gc/java.wasm?url';
import type { UsageKey, UsageString } from "./JarIndex.js";

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

export const index = async (data: ArrayBufferLike): Promise<void> => {
    const indexer = await getIndexer();
    indexer.index(data);
};

export const getUsage = async (key: UsageKey): Promise<[UsageString]> => {
    const indexer = await getIndexer();
    return indexer.getUsage(key);
};

export const getUsageSize = async (): Promise<number> => {
    const indexer = await getIndexer();
    return indexer.getUsageSize();
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
    getUsage(key: UsageKey): [UsageString];
    getUsageSize(): number;
    getBytecode(classData: ArrayBufferLike[]): string;
    getClassData(): ClassDataString[];
}