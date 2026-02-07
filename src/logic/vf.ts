import wasmPath from "@run-slicer/vf/vf.wasm?url";
import { load } from "@run-slicer/vf/vf.wasm-runtime.js";
import type * as vf from "@run-slicer/vf";

export type * from "@run-slicer/vf";

let runtime: typeof vf | null = null;
let runtimePreferWasm = true;

export async function loadRuntime(preferWasm: boolean) {
    if (!runtime || runtimePreferWasm !== preferWasm) {
        runtimePreferWasm = preferWasm;
        console.log(`Loading VineFlower ${preferWasm ? "WASM" : "JavaScript"} runtime`);

        let loadJs = !preferWasm;
        if (preferWasm) {
            try {
                const { exports } = await load(wasmPath, { noAutoImports: true });
                runtime = exports;
                loadJs = false;
            } catch (e) {
                console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
                loadJs = true;
            }
        }

        if (loadJs) {
            runtime = await import("@run-slicer/vf/vf.runtime.js");
        }
    }
}

export const decompile: typeof vf.decompile = async (name, options) => {
    if (!runtime) throw "No runtime loaded";
    return await runtime.decompile(name, options);
};
