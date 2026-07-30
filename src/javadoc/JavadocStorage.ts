import { load } from "../../java/build/generated/teavm/wasm-gc/java.wasm-runtime.js";
import mappingsWasm from "../../java/build/generated/teavm/wasm-gc/java.wasm?url";

export type JavadocFormat = "tiny2" | "enigma";
export type JavadocElementKind = 0 | 1 | 2;

export interface JavadocFile {
    handle: FileSystemFileHandle;
    format: JavadocFormat;
}

interface JavadocMappingsBridge {
    readJavadocs(data: ArrayBuffer): string;
    writeJavadocs(format: JavadocFormat): Int8Array;
    createJavadocs(format: JavadocFormat): Int8Array;
    resetJavadocs(): void;
    getJavadoc(
        kind: JavadocElementKind,
        owner: string,
        name: string,
        descriptor: string,
    ): string | null;
    setJavadoc(
        kind: JavadocElementKind,
        owner: string,
        name: string,
        descriptor: string,
        comment: string | null,
    ): void;
}

let bridge: JavadocMappingsBridge | null = null;

export async function readJavadocFile(handle: FileSystemFileHandle): Promise<JavadocFile> {
    const selectedFile = await handle.getFile();
    const format = (await getBridge()).readJavadocs(await selectedFile.arrayBuffer());
    if (format !== "tiny2" && format !== "enigma") {
        throw new Error("Invalid Javadoc mapping format");
    }

    return { handle, format };
}

export async function createJavadocFile(
    handle: FileSystemFileHandle,
    format: JavadocFormat,
): Promise<JavadocFile> {
    const mappingsBridge = await getBridge();
    await writeBytes(handle, mappingsBridge.createJavadocs(format));
    mappingsBridge.resetJavadocs();
    return { handle, format };
}

export async function writeJavadocFile(file: JavadocFile): Promise<void> {
    await writeBytes(file.handle, requireBridge().writeJavadocs(file.format));
}

export function getStoredJavadoc(
    kind: JavadocElementKind,
    owner: string,
    name: string,
    descriptor: string,
): string | null {
    return requireBridge().getJavadoc(kind, owner, name, descriptor);
}

export function setStoredJavadoc(
    kind: JavadocElementKind,
    owner: string,
    name: string,
    descriptor: string,
    comment: string | null,
): void {
    requireBridge().setJavadoc(kind, owner, name, descriptor, comment);
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

function requireBridge(): JavadocMappingsBridge {
    if (!bridge) throw new Error("Javadoc mappings are not loaded");
    return bridge;
}
