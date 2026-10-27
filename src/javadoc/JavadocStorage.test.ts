import { beforeEach, describe, expect, it, vi } from "vitest";
import { toClassName } from "../utils/Names";

const bridge = vi.hoisted(() => ({
    readJavadocs: vi.fn(),
    beginJavadocDirectory: vi.fn(),
    readJavadocDirectoryFile: vi.fn(),
    finishJavadocDirectory: vi.fn(),
    abortJavadocDirectory: vi.fn(),
    writeJavadocs: vi.fn(),
    writeJavadocClass: vi.fn(),
    createJavadocs: vi.fn(),
    resetJavadocs: vi.fn(),
    getJavadoc: vi.fn(),
    setJavadoc: vi.fn(),
}));

vi.mock("../../java/build/generated/teavm/wasm-gc/mcsrc.wasm-runtime.js", () => ({
    load: vi.fn(async () => ({ exports: bridge })),
}));
vi.mock("../../java/build/generated/teavm/wasm-gc/mcsrc.wasm?url", () => ({ default: "test.wasm" }));

import {
    readAnnotaterDirectory,
    readJavadocDirectory,
    readJavadocFile,
    writeJavadocSource,
    type JavadocDirectorySource,
} from "./JavadocStorage";

class FakeFile {
    readonly kind = "file";
    readonly name: string;
    writes = 0;
    failWrites = false;
    content: Uint8Array;

    constructor(name: string, content = "") {
        this.name = name;
        this.content = new TextEncoder().encode(content);
    }

    asHandle(): FileSystemFileHandle {
        return {
            kind: this.kind,
            name: this.name,
            getFile: async () => ({
                text: async () => new TextDecoder().decode(this.content),
                arrayBuffer: async () => this.content.buffer.slice(
                    this.content.byteOffset,
                    this.content.byteOffset + this.content.byteLength,
                ),
            }),
            createWritable: async () => ({
                write: async (data: BufferSource) => {
                    this.writes++;
                    if (this.failWrites) throw new DOMException("Write failed", "UnknownError");
                    const view = data instanceof ArrayBuffer
                        ? new Uint8Array(data)
                        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                    this.content = new Uint8Array(view);
                },
                close: async () => {},
                abort: async () => {},
            }),
        } as unknown as FileSystemFileHandle;
    }
}

class FakeDirectory {
    readonly kind = "directory";
    readonly name: string;
    readonly entries = new Map<string, FakeFile | FakeDirectory>();
    readonly deleted: string[] = [];
    failCreatedFileWrites = false;

    constructor(name: string) {
        this.name = name;
    }

    add(entry: FakeFile | FakeDirectory): this {
        this.entries.set(entry.name, entry);
        return this;
    }

    asHandle(): FileSystemDirectoryHandle {
        const directory = this;
        return {
            kind: this.kind,
            name: this.name,
            async *values() {
                for (const entry of directory.entries.values()) {
                    yield entry.asHandle();
                }
            },
            async getDirectoryHandle(name: string, options?: { create?: boolean }) {
                const existing = directory.entries.get(name);
                if (existing instanceof FakeDirectory) return existing.asHandle();
                if (existing) throw new DOMException("Entry is a file", "TypeMismatchError");
                if (!options?.create) throw new DOMException("Missing directory", "NotFoundError");

                const created = new FakeDirectory(name);
                directory.add(created);
                return created.asHandle();
            },
            async getFileHandle(name: string, options?: { create?: boolean }) {
                const existing = directory.entries.get(name);
                if (existing instanceof FakeFile) return existing.asHandle();
                if (existing) throw new DOMException("Entry is a directory", "TypeMismatchError");
                if (!options?.create) throw new DOMException("Missing file", "NotFoundError");

                const created = new FakeFile(name);
                created.failWrites = directory.failCreatedFileWrites;
                directory.add(created);
                return created.asHandle();
            },
            async removeEntry(name: string) {
                if (!directory.entries.delete(name)) throw new DOMException("Missing file", "NotFoundError");
                directory.deleted.push(name);
            },
        } as FileSystemDirectoryHandle;
    }
}

describe("JavadocStorage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bridge.readJavadocDirectoryFile.mockImplementation(
            (_data: ArrayBuffer, path: string) => path.slice(0, -".mapping".length),
        );
    });

    it("opens an empty Enigma file as a new mapping tree", async () => {
        const source = await readJavadocFile(new FakeFile("docs-without-an-extension").asHandle());

        expect(source.format).toBe("enigma");
        expect(bridge.resetJavadocs).toHaveBeenCalledOnce();
        expect(bridge.readJavadocs).not.toHaveBeenCalled();
    });

    it("reads Annotater config and loads only its configured mappings subdirectory", async () => {
        const mappings = new FakeDirectory("enigma").add(new FakeFile("Owner.mapping", "CLASS Owner\n"));
        const root = new FakeDirectory("project")
            .add(new FakeFile("config.json", JSON.stringify({ mappings: "docs/enigma", version: "26.1" })))
            .add(new FakeDirectory("docs").add(mappings))
            .add(new FakeFile("Ignored.mapping", "invalid"));

        const project = await readAnnotaterDirectory(root.asHandle());

        expect(project.version).toBe("26.1");
        expect(project.source.handle.name).toBe("enigma");
        expect(project.source.files.get("Owner")).toEqual(["Owner.mapping"]);
        expect(bridge.readJavadocDirectoryFile).toHaveBeenCalledOnce();
    });

    it.each([
        null,
        [],
        {},
        { mappings: "docs" },
        { mappings: "docs", version: " " },
        { mappings: 1, version: "26.1" },
        { mappings: "docs", version: 26.1 },
    ])("rejects invalid Annotater config %j before loading mappings", async config => {
        const root = new FakeDirectory("project")
            .add(new FakeFile("config.json", JSON.stringify(config)));

        await expect(readAnnotaterDirectory(root.asHandle())).rejects.toThrow("config.json must contain");

        expect(bridge.beginJavadocDirectory).not.toHaveBeenCalled();
    });

    it.each(["", "/docs", "../docs", "docs/../other", "./docs", "docs//enigma", "docs/", "docs\\enigma", "C:/docs"])(
        "rejects invalid Annotater mappings path %j",
        async mappings => {
            const root = new FakeDirectory("project")
                .add(new FakeFile("config.json", JSON.stringify({ mappings, version: "26.1" })));

            await expect(readAnnotaterDirectory(root.asHandle())).rejects.toThrow('The "mappings" path');

            expect(bridge.beginJavadocDirectory).not.toHaveBeenCalled();
        },
    );

    it("rejects missing or malformed Annotater config without loading mappings", async () => {
        const root = new FakeDirectory("project");

        await expect(readAnnotaterDirectory(root.asHandle())).rejects.toMatchObject({ name: "NotFoundError" });

        root.add(new FakeFile("config.json", "invalid json"));
        await expect(readAnnotaterDirectory(root.asHandle())).rejects.toThrow(SyntaxError);

        expect(bridge.beginJavadocDirectory).not.toHaveBeenCalled();
    });

    it("does not create a missing Annotater mappings directory", async () => {
        const root = new FakeDirectory("project")
            .add(new FakeFile("config.json", JSON.stringify({ mappings: "missing", version: "26.1" })));

        await expect(readAnnotaterDirectory(root.asHandle())).rejects.toMatchObject({ name: "NotFoundError" });

        expect(root.entries.has("missing")).toBe(false);
        expect(bridge.beginJavadocDirectory).not.toHaveBeenCalled();
    });

    it("recursively reads mapping files and preserves their paths", async () => {
        const root = new FakeDirectory("mappings");
        const firstPackage = new FakeDirectory("a")
            .add(new FakeFile("A.mapping", "CLASS a/A\n"))
            .add(new FakeFile("notes.txt", "ignored"));
        const secondPackage = new FakeDirectory("b").add(new FakeFile("B.mapping", "CLASS b/B\n"));
        root.add(firstPackage).add(secondPackage);
        const source = await readJavadocDirectory(root.asHandle());

        expect(bridge.beginJavadocDirectory).toHaveBeenCalledOnce();
        expect(bridge.readJavadocDirectoryFile.mock.calls.map(call => call[1])).toEqual([
            "a/A.mapping",
            "b/B.mapping",
        ]);
        expect(bridge.finishJavadocDirectory).toHaveBeenCalledOnce();
        expect(bridge.abortJavadocDirectory).not.toHaveBeenCalled();
        expect(source.files.get("a/A")).toEqual(["a", "A.mapping"]);
        expect(source.files.get("b/B")).toEqual(["b", "B.mapping"]);
    });

    it("opens an empty directory", async () => {
        const root = new FakeDirectory("mappings");
        const source = await readJavadocDirectory(root.asHandle());

        expect(bridge.beginJavadocDirectory).toHaveBeenCalledOnce();
        expect(bridge.readJavadocDirectoryFile).not.toHaveBeenCalled();
        expect(bridge.finishJavadocDirectory).toHaveBeenCalledOnce();
        expect(source.files.size).toBe(0);
    });

    it("aborts a staged directory import when a file is invalid", async () => {
        const root = new FakeDirectory("mappings")
            .add(new FakeFile("Owner.mapping", "invalid"));
        bridge.readJavadocDirectoryFile.mockImplementation(() => {
            throw new Error("Invalid mapping");
        });

        await expect(readJavadocDirectory(root.asHandle())).rejects.toThrow("Invalid mapping");

        expect(bridge.abortJavadocDirectory).toHaveBeenCalledOnce();
        expect(bridge.finishJavadocDirectory).not.toHaveBeenCalled();
    });

    it("rewrites only the changed class at its mapped path", async () => {
        const changed = new FakeFile("A.mapping", "old");
        const untouched = new FakeFile("Other.mapping", "untouched");
        const packageDirectory = new FakeDirectory("named").add(changed).add(untouched);
        const root = new FakeDirectory("mappings").add(packageDirectory);
        const source = directorySource(root, new Map([["a/A", ["named", "A.mapping"]]]));
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([1, 2, 3]));

        await writeJavadocSource(source, toClassName("a/A$Inner"));

        expect(changed.writes).toBe(1);
        expect(untouched.writes).toBe(0);
        expect([...changed.content]).toEqual([1, 2, 3]);
        expect(source.files.get("a/A")).toEqual(["named", "A.mapping"]);
    });

    it("preserves a directory at the target mapping file path", async () => {
        const existing = new FakeDirectory("Owner.mapping");
        const root = new FakeDirectory("mappings").add(existing);
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await expect(writeJavadocSource(source, toClassName("Owner"))).rejects.toMatchObject({
            name: "TypeMismatchError",
        });

        expect(root.entries.get("Owner.mapping")).toBe(existing);
        expect(source.files.size).toBe(0);
    });

    it("preserves a file at the target package directory path", async () => {
        const existing = new FakeFile("package", "untouched");
        const root = new FakeDirectory("mappings").add(existing);
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await expect(writeJavadocSource(source, toClassName("package/Owner"))).rejects.toMatchObject({
            name: "TypeMismatchError",
        });

        expect(root.entries.get("package")).toBe(existing);
        expect(existing.writes).toBe(0);
        expect(source.files.size).toBe(0);
    });

    it("creates a canonical path for a newly documented class", async () => {
        const root = new FakeDirectory("mappings");
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await writeJavadocSource(source, toClassName("new/package/Owner"));

        expect(source.files.get("new/package/Owner")).toEqual(["new", "package", "Owner.mapping"]);
        const newDirectory = root.entries.get("new") as FakeDirectory;
        const packageDirectory = newDirectory.entries.get("package") as FakeDirectory;
        expect((packageDirectory.entries.get("Owner.mapping") as FakeFile).writes).toBe(1);
    });

    it("removes a newly created mapping file when writing fails", async () => {
        const root = new FakeDirectory("mappings");
        root.failCreatedFileWrites = true;
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await expect(writeJavadocSource(source, toClassName("Owner"))).rejects.toThrow("Write failed");

        expect(root.deleted).toEqual(["Owner.mapping"]);
        expect(root.entries.has("Owner.mapping")).toBe(false);
        expect(source.files.has("Owner")).toBe(false);
    });

    it("preserves a leading dollar sign in an outer class name", async () => {
        const root = new FakeDirectory("mappings");
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await writeJavadocSource(source, toClassName("new/package/$Proxy$Inner"));

        expect(bridge.writeJavadocClass).toHaveBeenCalledWith("new/package/$Proxy");
        expect(source.files.get("new/package/$Proxy")).toEqual(["new", "package", "$Proxy.mapping"]);
    });

    it("deletes only the changed file when its class becomes empty", async () => {
        const empty = new FakeFile("Empty.mapping");
        const other = new FakeFile("Other.mapping");
        const packageDirectory = new FakeDirectory("a").add(empty).add(other);
        const root = new FakeDirectory("mappings").add(packageDirectory);
        const source = directorySource(root, new Map([["a/Empty", ["a", "Empty.mapping"]]]));
        bridge.writeJavadocClass.mockReturnValue(new Int8Array());

        await writeJavadocSource(source, toClassName("a/Empty"));

        expect(packageDirectory.deleted).toEqual(["Empty.mapping"]);
        expect(packageDirectory.entries.has("Other.mapping")).toBe(true);
        expect(source.files.has("a/Empty")).toBe(false);
    });
});

function directorySource(
    root: FakeDirectory,
    files = new Map<string, string[]>(),
): JavadocDirectorySource {
    return { kind: "directory", handle: root.asHandle(), files };
}
