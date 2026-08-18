import { load } from "../../java/build/generated/teavm/wasm-gc/mcsrc.wasm-runtime.js";
import mappingsWasm from "../../java/build/generated/teavm/wasm-gc/mcsrc.wasm?url";

export type JavadocFormat = "tiny2" | "enigma";
export type JavadocElementKind = 0 | 1 | 2;

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
    readJavadocDirectory(data: ArrayBuffer[], paths: string[]): string[];
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
    const format = (await getBridge()).readJavadocs(await selectedFile.arrayBuffer());
    if (format !== "tiny2" && format !== "enigma") {
        throw new Error("Invalid Javadoc mapping format");
    }

    return { kind: "file", handle, format };
}

export async function readJavadocDirectory(handle: FileSystemDirectoryHandle): Promise<JavadocDirectorySource> {
    const mappingFiles = await collectMappingFiles(handle);
    const buffers = await Promise.all(mappingFiles.map(async file => (await file.handle.getFile()).arrayBuffer()));
    const paths = mappingFiles.map(file => file.path.join("/"));
    const owners = (await getBridge()).readJavadocDirectory(buffers, paths);
    const files = new Map<string, string[]>();

    if (owners.length !== mappingFiles.length) {
        throw new Error("Invalid Enigma directory index");
    }

    owners.forEach((owner, index) => files.set(owner, mappingFiles[index].path));
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

    const outerOwner = owner.split("$")[0];
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
    const handle = await getFileHandle(source.handle, path, true);
    await writeBytes(handle, bytes);
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
