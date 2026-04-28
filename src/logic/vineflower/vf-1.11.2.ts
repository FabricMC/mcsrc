import wasmPath from "vf-1.11.2/vf.wasm?url";
import { load } from "vf-1.11.2/vf.wasm-runtime.js";
import type * as vf from "vf-1.11.2";

let runtime: typeof vf | null = null;
let runtimePreferWasm = true;

export async function loadRuntime(preferWasm: boolean) {
    if (!runtime || runtimePreferWasm !== preferWasm) {
        runtimePreferWasm = preferWasm;
        console.log(`Loading VineFlower 1.11.2 ${preferWasm ? "WASM" : "JavaScript"} runtime`);

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
            runtime = await import("vf-1.11.2/vf.runtime.js");
        }
    }
}

export const decompile: typeof vf.decompile = async (name: string | string[], options?: vf.Config) => {
    if (!runtime) throw "No runtime loaded";
    return await runtime.decompile(name, options);
};
