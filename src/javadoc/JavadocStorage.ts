import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import mappingsWasm from "../../java/build/generated/teavm/wasm-gc/java.wasm?url";
import type { ClassName } from "../utils/Names";
import type { JavadocData } from "./Javadoc";

export type JavadocFormat = "tiny2" | "enigma";

export interface JavadocFile {
    handle: FileSystemFileHandle;
    format: JavadocFormat;
}

interface JavadocMappingsBridge {
    readJavadocs(data: ArrayBuffer): string[];
    writeJavadocs(format: JavadocFormat, entries: string[]): Int8Array;
    createJavadocs(format: JavadocFormat): Int8Array;
}

let bridge: JavadocMappingsBridge | null = null;

export async function readJavadocFile(handle: FileSystemFileHandle): Promise<{
    file: JavadocFile;
    data: JavadocData;
}> {
    const selectedFile = await handle.getFile();
    const entries = (await getBridge()).readJavadocs(await selectedFile.arrayBuffer());
    const format = entries.shift() as JavadocFormat | undefined;
    if (format !== "tiny2" && format !== "enigma") throw new Error("Invalid Javadoc mapping format");

    return {
        file: { handle, format },
        data: fromEntries(entries),
    };
}

export async function createJavadocFile(
    handle: FileSystemFileHandle,
    format: JavadocFormat,
): Promise<JavadocFile> {
    await writeBytes(handle, (await getBridge()).createJavadocs(format));
    return { handle, format };
}

export async function writeJavadocFile(file: JavadocFile, data: JavadocData): Promise<void> {
    await writeBytes(file.handle, (await getBridge()).writeJavadocs(file.format, toEntries(data)));
}

function fromEntries(entries: string[]): JavadocData {
    const classes: JavadocData["classes"] = {};

    for (let i = 0; i < entries.length; i += 5) {
        const [kind, owner, name, descriptor, comment] = entries.slice(i, i + 5);
        if (!kind || !owner || comment === undefined) throw new Error("Invalid Javadoc mapping data");

        const clazz = classes[owner as ClassName] ??= { javadoc: null, fields: {}, methods: {} };
        if (kind === "c") clazz.javadoc = comment || null;
        else if (kind === "f") clazz.fields[name + "\0" + descriptor] = comment;
        else if (kind === "m") clazz.methods[name + "\0" + descriptor] = comment;
        else throw new Error(`Invalid Javadoc mapping entry: ${kind}`);
    }

    return { classes };
}

function toEntries(data: JavadocData): string[] {
    const result: string[] = [];
    for (const [owner, clazz] of Object.entries(data.classes).sort(([a], [b]) => a.localeCompare(b))) {
        if (!clazz) continue;
        const fields = Object.entries(clazz.fields ?? {}).sort(([a], [b]) => a.localeCompare(b));
        const methods = Object.entries(clazz.methods ?? {}).sort(([a], [b]) => a.localeCompare(b));
        if (!clazz.javadoc && fields.length === 0 && methods.length === 0) continue;

        result.push("c", owner, "", "", clazz.javadoc ?? "");
        addMembers(result, "f", owner, fields);
        addMembers(result, "m", owner, methods);
    }
    return result;
}

function addMembers(
    result: string[],
    kind: "f" | "m",
    owner: string,
    members: [string, string][],
): void {
    for (const [key, comment] of members) {
        const separator = key.indexOf("\0");
        if (separator < 0) throw new Error(`Invalid member Javadoc key: ${key}`);
        result.push(kind, owner, key.slice(0, separator), key.slice(separator + 1), comment);
    }
}

async function writeBytes(handle: FileSystemFileHandle, bytes: Int8Array): Promise<void> {
    const writable = await handle.createWritable();
    const output = new Uint8Array(bytes.byteLength);
    output.set(bytes);

    try {
        await writable.write(output);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
    }
}

async function getBridge(): Promise<JavadocMappingsBridge> {
    if (bridge) return bridge;

    try {
        const teavm = await load(mappingsWasm);
        bridge = teavm.exports as JavadocMappingsBridge;
    } catch (error) {
        console.warn("Failed to load Javadoc mappings WASM, falling back to JavaScript", error);
        bridge = await import("../../java/build/generated/teavm/js/java.js") as unknown as JavadocMappingsBridge;
    }

    return bridge;
}
