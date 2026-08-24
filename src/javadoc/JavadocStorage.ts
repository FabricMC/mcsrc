import { load } from "../../java/build/generated/teavm/wasm-gc/mcsrc.wasm-runtime.js";
import mappingsWasm from "../../java/build/generated/teavm/wasm-gc/mcsrc.wasm?url";

export type JavadocFormat = "tiny2" | "enigma";
export const JavadocElementKind = {
    Class: 0,
    Field: 1,
    Method: 2,
} as const;
export type JavadocElementKind = typeof JavadocElementKind[keyof typeof JavadocElementKind];

export interface JavadocFileSource {
    kind: "file";
    handle: FileSystemFileHandle;
    format: JavadocFormat;
}

export interface JavadocDirectorySource {
    kind: "directory";
    handle: FileSystemDirectoryHandle;
    files: Map<string, string[]>;
}

export type JavadocSource = JavadocFileSource | JavadocDirectorySource;

interface JavadocMappingsBridge {
    readJavadocs(data: ArrayBuffer): string;
    beginJavadocDirectory(): void;
    readJavadocDirectoryFile(data: ArrayBuffer, path: string): string;
    finishJavadocDirectory(): void;
    abortJavadocDirectory(): void;
    writeJavadocs(format: JavadocFormat): Int8Array;
    writeJavadocClass(owner: string): Int8Array;
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

export async function readJavadocFile(handle: FileSystemFileHandle): Promise<JavadocFileSource> {
    const selectedFile = await handle.getFile();
    const data = await selectedFile.arrayBuffer();
    const mappingsBridge = await getBridge();

    if (data.byteLength === 0 && !handle.name.toLowerCase().endsWith(".tiny")) {
        mappingsBridge.resetJavadocs();
        return { kind: "file", handle, format: "enigma" };
    }

    const format = mappingsBridge.readJavadocs(data);
    if (format !== "tiny2" && format !== "enigma") {
        throw new Error("Invalid Javadoc mapping format");
    }

    return { kind: "file", handle, format };
}

export async function readJavadocDirectory(handle: FileSystemDirectoryHandle): Promise<JavadocDirectorySource> {
    const mappingFiles = await collectMappingFiles(handle);
    const mappingsBridge = await getBridge();
    const files = new Map<string, string[]>();
    mappingsBridge.beginJavadocDirectory();

    try {
        for (const mappingFile of mappingFiles) {
            const data = await (await mappingFile.handle.getFile()).arrayBuffer();
            const owner = mappingsBridge.readJavadocDirectoryFile(data, mappingFile.path.join("/"));
            files.set(owner, mappingFile.path);
        }

        mappingsBridge.finishJavadocDirectory();
    } catch (error) {
        mappingsBridge.abortJavadocDirectory();
        throw error;
    }

    return { kind: "directory", handle, files };
}

export async function createJavadocFile(
    handle: FileSystemFileHandle,
    format: JavadocFormat,
): Promise<JavadocFileSource> {
    const mappingsBridge = await getBridge();
    await writeBytes(handle, mappingsBridge.createJavadocs(format));
    mappingsBridge.resetJavadocs();
    return { kind: "file", handle, format };
}

export async function writeJavadocSource(source: JavadocSource, owner: string): Promise<void> {
    if (source.kind === "file") {
        await writeBytes(source.handle, requireBridge().writeJavadocs(source.format));
        return;
    }

    const outerOwner = outerClassName(owner);
    const bytes = requireBridge().writeJavadocClass(outerOwner);
    const existingPath = source.files.get(outerOwner);

    if (bytes.byteLength === 0) {
        if (existingPath) {
            await deleteFile(source.handle, existingPath);
            source.files.delete(outerOwner);
        }
        return;
    }

    const path = existingPath ?? `${outerOwner}.mapping`.split("/");
    let created = false;

    if (!existingPath) {
        try {
            await getFileHandle(source.handle, path, false);
            throw new Error(`Mapping file ${path.join("/")} already exists`);
        } catch (error) {
            if (!isNotFoundError(error)) throw error;
        }

        created = true;
    }

    const handle = await getFileHandle(source.handle, path, true);

    try {
        await writeBytes(handle, bytes);
    } catch (error) {
        if (created) await deleteFile(source.handle, path).catch(() => {});
        throw error;
    }

    source.files.set(outerOwner, path);
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

interface MappingFile {
    handle: FileSystemFileHandle;
    path: string[];
}

async function collectMappingFiles(
    directory: FileSystemDirectoryHandle,
    parentPath: string[] = [],
): Promise<MappingFile[]> {
    const result: MappingFile[] = [];

    for await (const entry of directory.values()) {
        const path = [...parentPath, entry.name];

        if (entry.kind === "directory") {
            result.push(...await collectMappingFiles(entry, path));
        } else if (entry.name.endsWith(".mapping")) {
            result.push({ handle: entry, path });
        }
    }

    if (parentPath.length === 0) {
        result.sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
    }

    return result;
}

async function getFileHandle(
    root: FileSystemDirectoryHandle,
    path: string[],
    create: boolean,
): Promise<FileSystemFileHandle> {
    if (path.length === 0) throw new Error("Mapping file path is empty");

    let directory = root;
    for (const part of path.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part, { create });
    }

    return directory.getFileHandle(path[path.length - 1], { create });
}

async function deleteFile(root: FileSystemDirectoryHandle, path: string[]): Promise<void> {
    if (path.length === 0) throw new Error("Mapping file path is empty");

    let directory = root;
    for (const part of path.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part);
    }

    await directory.removeEntry(path[path.length - 1]);
}

function isNotFoundError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "NotFoundError";
}

function outerClassName(name: string): string {
    let start = 0;

    while (true) {
        const separator = name.indexOf("$", start);
        if (separator < 0) return name;
        if (separator === 0 || name[separator - 1] !== "/") return name.slice(0, separator);
        start = separator + 1;
    }
}

async function getBridge(): Promise<JavadocMappingsBridge> {
    if (bridge) return bridge;

    try {
        const teavm = await load(mappingsWasm);
        bridge = teavm.exports as JavadocMappingsBridge;
    } catch (error) {
        console.warn("Failed to load Javadoc mappings WASM, falling back to JavaScript", error);
        bridge = await import("../../java/build/generated/teavm/js/mcsrc.js") as unknown as JavadocMappingsBridge;
    }

    return bridge;
}

function requireBridge(): JavadocMappingsBridge {
    if (!bridge) throw new Error("Javadoc mappings are not loaded");
    return bridge;
}
