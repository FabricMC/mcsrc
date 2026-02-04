import wasmPath from "@run-slicer/vf/vf.wasm?url";
import { load } from "@run-slicer/vf/vf.wasm-runtime.js";
import type * as vf from "@run-slicer/vf";

export type Options = vf.Options;
export type TokenCollector = vf.TokenCollector;
export type OutputSink = vf.OutputSink;
export type Config = vf.Config;

// Copied from ../node_modules/@run-slicer/vf/vf.js as I needed to get the correct import paths
let decompileFunc: typeof vf.decompile | null = null;
export const decompile: typeof vf.decompile = async (name, options) => {
    if (!decompileFunc) {
        try {
            const { exports } = await load(wasmPath, { noAutoImports: true });
            decompileFunc = exports.decompile;
        } catch (e) {
            console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
            const { decompile: decompileJS } = await import("@run-slicer/vf/vf.runtime.js");
            decompileFunc = decompileJS;
        }
    }

    return decompileFunc!(name, options);
};

let decompileManyFunc : typeof vf.decompileMany | null = null
export const decompileMany: typeof vf.decompileMany = async (name, options) => {
    if (!decompileManyFunc) {
        try {
            const { exports } = await load(wasmPath, { noAutoImports: true });

            decompileManyFunc = exports.decompileMany;
        } catch (e) {
            console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
            const { decompileMany: decompileManyJS } = await import("@run-slicer/vf/vf.runtime.js");
            decompileManyFunc = decompileManyJS;
        }
    }

    return decompileManyFunc(name, options);
};
