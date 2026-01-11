import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from '../../java/build/generated/teavm/wasm-gc/java.wasm?url';
import type { UsageKey, UsageString } from "./JarIndex.js";

export type ClassDataString = `${string}|${string}|${number}|${string}`;

let teavm: Awaited<ReturnType<typeof load>> | null = null;

const getIndexer = async (): Promise<Indexer> => {
    if (!teavm) {
        teavm = await load(indexerWasm);
    }
    return teavm.exports as Indexer;
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