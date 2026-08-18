import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
    readJavadocs: vi.fn(),
    readJavadocDirectory: vi.fn(),
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
    readJavadocDirectory,
    readJavadocFile,
    writeJavadocSource,
    type JavadocDirectorySource,
} from "./JavadocStorage";

class FakeFile {
    readonly kind = "file";
    readonly name: string;
    writes = 0;
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
                arrayBuffer: async () => this.content.buffer.slice(
                    this.content.byteOffset,
                    this.content.byteOffset + this.content.byteLength,
                ),
            }),
            createWritable: async () => ({
                write: async (data: BufferSource) => {
                    this.writes++;
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
                    yield entry instanceof FakeDirectory ? entry.asHandle() : entry.asHandle();
                }
            },
            async getDirectoryHandle(name: string, options?: { create?: boolean }) {
                const existing = directory.entries.get(name);
                if (existing instanceof FakeDirectory) return existing.asHandle();
                if (!options?.create) throw new DOMException("Missing directory", "NotFoundError");

                const created = new FakeDirectory(name);
                directory.add(created);
                return created.asHandle();
            },
            async getFileHandle(name: string, options?: { create?: boolean }) {
                const existing = directory.entries.get(name);
                if (existing instanceof FakeFile) return existing.asHandle();
                if (!options?.create) throw new DOMException("Missing file", "NotFoundError");

                const created = new FakeFile(name);
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
    });

    it("opens an empty Enigma file as a new mapping tree", async () => {
        const source = await readJavadocFile(new FakeFile("docs.mapping").asHandle());

        expect(source.format).toBe("enigma");
        expect(bridge.resetJavadocs).toHaveBeenCalledOnce();
        expect(bridge.readJavadocs).not.toHaveBeenCalled();
    });

    it("recursively reads mapping files and preserves their paths", async () => {
        const root = new FakeDirectory("mappings");
        const firstPackage = new FakeDirectory("a")
            .add(new FakeFile("A.mapping", "CLASS a/A\n"))
            .add(new FakeFile("notes.txt", "ignored"));
        const secondPackage = new FakeDirectory("b").add(new FakeFile("B.mapping", "CLASS b/B\n"));
        root.add(firstPackage).add(secondPackage);
        bridge.readJavadocDirectory.mockReturnValue(["a/A", "b/B"]);

        const source = await readJavadocDirectory(root.asHandle());

        expect(bridge.readJavadocDirectory).toHaveBeenCalledOnce();
        expect(bridge.readJavadocDirectory.mock.calls[0][1]).toEqual(["a/A.mapping", "b/B.mapping"]);
        expect(source.files.get("a/A")).toEqual(["a", "A.mapping"]);
        expect(source.files.get("b/B")).toEqual(["b", "B.mapping"]);
    });

    it("opens an empty directory", async () => {
        const root = new FakeDirectory("mappings");
        bridge.readJavadocDirectory.mockReturnValue([]);

        const source = await readJavadocDirectory(root.asHandle());

        expect(bridge.readJavadocDirectory).toHaveBeenCalledWith([], []);
        expect(source.files.size).toBe(0);
    });

    it("rewrites only the changed class at its existing path", async () => {
        const changed = new FakeFile("A.mapping", "old");
        const untouched = new FakeFile("Other.mapping", "untouched");
        const packageDirectory = new FakeDirectory("a").add(changed).add(untouched);
        const root = new FakeDirectory("mappings").add(packageDirectory);
        const source = directorySource(root, new Map([["a/A", ["a", "A.mapping"]]]));
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([1, 2, 3]));

        await writeJavadocSource(source, "a/A$Inner");

        expect(changed.writes).toBe(1);
        expect(untouched.writes).toBe(0);
        expect([...changed.content]).toEqual([1, 2, 3]);
    });

    it("creates a canonical path for a newly documented class", async () => {
        const root = new FakeDirectory("mappings");
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await writeJavadocSource(source, "new/package/Owner");

        expect(source.files.get("new/package/Owner")).toEqual(["new", "package", "Owner.mapping"]);
        const newDirectory = root.entries.get("new") as FakeDirectory;
        const packageDirectory = newDirectory.entries.get("package") as FakeDirectory;
        expect((packageDirectory.entries.get("Owner.mapping") as FakeFile).writes).toBe(1);
    });

    it("preserves a leading dollar sign in an outer class name", async () => {
        const root = new FakeDirectory("mappings");
        const source = directorySource(root);
        bridge.writeJavadocClass.mockReturnValue(new Int8Array([4, 5]));

        await writeJavadocSource(source, "new/package/$Proxy$Inner");

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

        await writeJavadocSource(source, "a/Empty");

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
