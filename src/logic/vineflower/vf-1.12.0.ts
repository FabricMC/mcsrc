import wasmPath from "vf-1.12.0/vf.wasm?url";
import { load } from "vf-1.12.0/vf.wasm-runtime.js";
import type * as vf from "vf-1.12.0";

let runtime: typeof vf | null = null;
let runtimePreferWasm = true;

export async function loadRuntime(preferWasm: boolean) {
    if (!runtime || runtimePreferWasm !== preferWasm) {
        console.log(`Loading VineFlower 1.12.0 ${preferWasm ? "WASM" : "JavaScript"} runtime (previous: ${runtime ? (runtimePreferWasm ? "WASM" : "JS") : "none"})`);

        if (preferWasm) {
            try {
                const { exports } = await load(wasmPath, { noAutoImports: true });
                runtime = exports;
                runtimePreferWasm = preferWasm;
                console.log("VineFlower 1.12.0 WASM runtime loaded successfully");
                return;
            } catch (e) {
                console.warn("Failed to load WASM module (non-compliant browser?), falling back to JS implementation", e);
                if (runtime) {
                    console.log("VineFlower 1.12.0 keeping existing JS runtime");
                    return;
                }
            }
        }

        try {
            runtime = await import("vf-1.12.0/vf.runtime.js");
            console.log("VineFlower 1.12.0 JS runtime loaded successfully");
        } catch (e) {
            throw new Error(`Failed to load JS runtime: ${e}`);
        }
        runtimePreferWasm = preferWasm;
    } else {
        console.log(`VineFlower 1.12.0 reusing existing ${runtimePreferWasm ? "WASM" : "JS"} runtime`);
    }
}

export const decompile: typeof vf.decompile = async (name: string | string[], options?: vf.Config) => {
    if (!runtime) throw new Error("No runtime loaded");
    return await runtime.decompile(name, options);
};
