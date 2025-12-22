import { load } from "../../indexer/build/generated/teavm/wasm-gc/indexer.wasm-runtime.js";
import indexerWasm from '../../indexer/build/generated/teavm/wasm-gc/indexer.wasm?url';

export const index = async (data: ArrayBufferLike, version: string): Promise<void> => {
    const teavm = await load(indexerWasm);
    const indexer = teavm.exports as Indexer;

    const context: Context = {
        addClassUsage: function (clazz: Class, usage: UsageString): void {
            //console.log(`Class: ${clazz}, Usage: ${usage}`);
        },
        addMethodUsage: function (method: Method, usage: UsageString): void {
            //console.log(`Method: ${method}, Usage: ${usage}`);
        },
        addFieldUsage: function (field: Field, usage: UsageString): void {
            //console.log(`Field: ${field}, Usage: ${usage}`);
        }
    };

    indexer.index(data, context);
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