/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { load } from "../../../java/build/generated/teavm/wasm-gc/mcsrc.wasm-runtime.js";
import * as javascript from "../../../java/build/generated/teavm/js/mcsrc.js";
import { toArrayBuffer } from "../../utils/ArrayBuffer";

type UnpickBridge = Pick<typeof javascript, "loadUnpickDefinitions" | "applyUnpick" | "resetUnpick" | "getBytecode">;

async function fixture(name: string): Promise<ArrayBuffer> {
    const file = new URL(`../../../java/build/classes/java/test/${name}.class`, import.meta.url);
    return toArrayBuffer(await readFile(file));
}

describe.each(["WASM", "JavaScript"])("Unpick %s runtime", runtime => {
    it("resolves classes asynchronously and replaces flags across definition files", async () => {
        let bridge: UnpickBridge;
        if (runtime === "JavaScript") {
            bridge = javascript;
        } else {
            const wasmFile = new URL("../../../java/build/generated/teavm/wasm-gc/mcsrc.wasm", import.meta.url);
            const wasmBytes = new Uint8Array(await readFile(wasmFile));
            const instance = await load(wasmBytes);
            bridge = instance.exports as UnpickBridge;
        }
        const requested: string[] = [];
        const definitions = [
            "unpick v4\ngroup int flags\n    @flags\n    mcsrc.UnpickTest$Api.FIRST | 0x0\n    mcsrc.UnpickTest$Api.SECOND\n",
            "unpick v4\ntarget_annotation mcsrc.UnpickTest$Flags flags\n",
        ];
        try {
            await bridge.loadUnpickDefinitions(definitions, async name => {
                requested.push(name);
                // Force a suspension, including when definitions resolve their constant fields.
                await new Promise(resolve => setTimeout(resolve, 0));
                if (name === "java/lang/Object") return null;
                return fixture(name);
            });
            const result = await bridge.applyUnpick(await fixture("mcsrc/UnpickTest$Usage"));
            const bytecode = bridge.getBytecode([toArrayBuffer(new Uint8Array(result))]);

            expect(bytecode).toContain("GETSTATIC mcsrc/UnpickTest$Api.FIRST");
            expect(bytecode).toContain("GETSTATIC mcsrc/UnpickTest$Api.SECOND");
            expect(bytecode).toContain("ICONST_3");
            expect(requested).toContain("mcsrc/UnpickTest$Api");
        } finally {
            bridge.resetUnpick();
        }
        await expect(bridge.applyUnpick(await fixture("mcsrc/UnpickTest$Usage"))).rejects.toThrow();
    });
});
