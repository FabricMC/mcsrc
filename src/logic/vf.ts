import wasmPath from "@run-slicer/vf/vf.wasm?url";
import { load } from "@run-slicer/vf/vf.wasm-runtime.js";

export type Options = Record<string, string>;

export interface TokenCollector {
    start: (content: string) => void;
    visitClass: (start: number, length: number, declaration: boolean, name: string) => void;
    visitField: (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string) => void;
    visitMethod: (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string) => void;
    visitParameter: (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string) => void;
    visitLocal: (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string) => void;
    end: () => void;
}

export interface Config {
    source?: (name: string) => Promise<Uint8Array | null>;
    resources?: string[];
    options?: Options;
    tokenCollector?: TokenCollector;
}


// Copied from ../node_modules/@run-slicer/vf/vf.js as I needed to get the correct import paths
let decompileFunc: ((name: string, options: Config) => Promise<string>) | null = null;
export const decompile = async (name: string, options: Config) => {
    if (!decompileFunc) {
        const { exports } = await load(wasmPath, { noAutoImports: true });

        decompileFunc = exports.decompile;
    }

    return decompileFunc!(name, options);
};
