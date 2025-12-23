import { load } from "../../indexer/build/generated/teavm/wasm-gc/indexer.wasm-runtime.js";
import indexerWasm from '../../indexer/build/generated/teavm/wasm-gc/indexer.wasm?url';
import { UsageIndexDB, type UsageEntry } from './UsageIndexDB';

let teavm: Awaited<ReturnType<typeof load>> | null = null;

export const index = async (data: ArrayBufferLike, version: string): Promise<void> => {
    if (!teavm) {
        teavm = await load(indexerWasm);
    }

    const indexer = teavm.exports as Indexer;
    const db = new UsageIndexDB(version);
    await db.open();

    const entries: UsageEntry[] = [];

    const addUsage = (key: string, value: string) => {
        entries.push({ key, value });
    };

    const context: Context = {
        addClassUsage: function (clazz: Class, usage: UsageString): void {
            addUsage(clazz, usage);
        },
        addMethodUsage: function (method: Method, usage: UsageString): void {
            addUsage(method, usage);
        },
        addFieldUsage: function (field: Field, usage: UsageString): void {
            addUsage(field, usage);
        }
    };

    indexer.index(data, context);

    await db.batchWrite(entries);

    db.close();
};

type Class = string;
type Method = `${string}:${string}:${string}`;
type Field = `${string}:${string}:${string}`;

type UsageString =
    | `c:${Class}`
    | `m:${Method}`
    | `f:${Field}`;

interface Context {
    addClassUsage: (clazz: Class, usage: UsageString) => void;
    addMethodUsage: (method: Method, usage: UsageString) => void;
    addFieldUsage: (field: Field, usage: UsageString) => void;
}

interface Indexer {
    index(data: ArrayBufferLike, context: Context): void;
}