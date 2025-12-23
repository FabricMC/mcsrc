import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import indexerWasm from '../../java/build/generated/teavm/wasm-gc/java.wasm?url';
import type { UsageKey, UsageString } from "./UsageIndex.js";

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

interface Indexer {
    index(data: ArrayBufferLike): void;
    getUsage(key: UsageKey): [UsageString];
    getUsageSize(): number;
}