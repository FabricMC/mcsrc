/// <reference types="node" />
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { load } from "../../../java/build/generated/teavm/wasm-gc/mcsrc.wasm-runtime.js";
import * as javascript from "../../../java/build/generated/teavm/js/mcsrc.js";
import { toArrayBuffer } from "../../utils/ArrayBuffer";

type UnpickBridge = Pick<typeof javascript,
    "loadUnpickDefinitions" | "validateUnpickDefinitions" | "applyUnpick" | "resetUnpick" | "getBytecode" | "readClassMembers">;

async function fixture(name: string): Promise<ArrayBuffer> {
    const file = new URL(`../../../java/build/classes/java/test/${name}.class`, import.meta.url);
    return toArrayBuffer(await readFile(file));
}

describe.each(["WASM", "JavaScript"])("Unpick %s runtime", runtime => {
    async function loadBridge(): Promise<UnpickBridge> {
        if (runtime === "JavaScript") return javascript;

        const wasmFile = new URL("../../../java/build/generated/teavm/wasm-gc/mcsrc.wasm", import.meta.url);
        const wasmBytes = new Uint8Array(await readFile(wasmFile));
        const instance = await load(wasmBytes);
        return instance.exports as UnpickBridge;
    }

    it("reads class members with JVM descriptors and parameter names", async () => {
        const bridge = await loadBridge();
        expect(bridge.readClassMembers(await fixture("mcsrc/UnpickTest$Api"))).toEqual(expect.arrayContaining([
            { kind: "field", name: "FIRST", descriptor: "I", isStatic: true, parameterNames: [] },
            { kind: "method", name: "accept", descriptor: "(I)V", isStatic: true, parameterNames: ["flags"] },
        ]));
    });

    it("reports the file index and the parser's line and optional column", async () => {
        const bridge = await loadBridge();
        const source = async () => null;
        const hasPackage = async () => false;
        await expect(bridge.validateUnpickDefinitions(["unpick v4\n", "unpick v4\ngroup nope example\n"], source, hasPackage))
            .resolves.toMatchObject({ definitionIndex: 1, lineNumber: 2, columnNumber: 7 });
        await expect(bridge.validateUnpickDefinitions(["invalid\n"], source, hasPackage))
            .resolves.toMatchObject({ definitionIndex: 0, lineNumber: 1, columnNumber: 1 });
        await expect(bridge.validateUnpickDefinitions(["unpick v4\n"], source, hasPackage)).resolves.toBeNull();
    });

    it.each(["v1", "v2", "unpick v3"])("rejects the %s header in validation and loading", async header => {
        const bridge = await loadBridge();
        const definitions = [`${header}\n`];
        const source = async () => null;
        const message = "Expected version header: unpick v4";

        await expect(bridge.validateUnpickDefinitions(definitions, source, async () => false))
            .resolves.toMatchObject({ definitionIndex: 0, lineNumber: 1, message: expect.stringContaining(message) });
        await expect(bridge.loadUnpickDefinitions(definitions, source)).rejects.toThrow(message);
    });

    it("checks target parameters while resolving groups across files", async () => {
        const bridge = await loadBridge();
        const group = "unpick v4\ngroup int flags\n    @scope package mcsrc\n    1\n";
        const target = "unpick v4\ntarget_method mcsrc.UnpickTest$Api accept (I)V\n    param 0 flags\n";
        const hasPackage = async (name: string) => name === "mcsrc";

        await expect(bridge.validateUnpickDefinitions([target, group], fixture, hasPackage)).resolves.toBeNull();
        await expect(bridge.validateUnpickDefinitions([target.replace("param 0", "param 1"), group], fixture, hasPackage))
            .resolves.toMatchObject({ definitionIndex: null, message: "Parameter index out of bounds: 1" });
        await expect(bridge.validateUnpickDefinitions([group], fixture, async () => false))
            .resolves.toMatchObject({ definitionIndex: 0, message: "Package mcsrc does not exist" });
    });

    it("resolves classes asynchronously and replaces flags across definition files", async () => {
        const bridge = await loadBridge();
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
