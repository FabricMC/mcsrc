import wasmPath from "@run-slicer/vf/vf.wasm?url";
import { load } from "@run-slicer/vf/vf.wasm-runtime.js";
import type * as vf from "@run-slicer/vf";

export type Options = vf.Options;
export type TokenCollector = vf.TokenCollector;
export type Config = vf.Config;

async function loadRuntime() {
    try {
        const { exports } = await load(wasmPath, { noAutoImports: true });
        return exports;
    } catch (e) {
        console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
        return await import("@run-slicer/vf/vf.runtime.js");
    }
}

// Copied from ../node_modules/@run-slicer/vf/vf.js as I needed to get the correct import paths
let decompileFunc: typeof vf.decompile | null = null;
export const decompile: typeof vf.decompile = async (name, options) => {
    if (!decompileFunc) decompileFunc = (await loadRuntime()).decompile
    return await decompileFunc(name, options);
};
