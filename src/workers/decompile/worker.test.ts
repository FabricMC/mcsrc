import { beforeEach, expect, it, vi } from "vitest";
import { toClassName } from "../../utils/Names";

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    bulkPut: vi.fn(),
    decompile: vi.fn(),
    loadUnpick: vi.fn(),
}));

vi.mock("comlink", () => ({ expose: vi.fn() }));
vi.mock("dexie", () => ({
    default: class {
        results7 = { get: mocks.get, bulkPut: mocks.bulkPut };
        options = { toArray: async () => [] };
        version() {
            return { stores() {} };
        }
    },
}));
vi.mock("../../logic/vineflower/vineflower", () => ({
    loadRuntime: vi.fn(),
    decompile: mocks.decompile,
}));
vi.mock("./Unpick", () => ({
    UnpickProcessor: class {
        load = mocks.loadUnpick;
        apply = async (bytes: Uint8Array) => bytes;
        reset = async () => {};
    },
}));
vi.mock("../../utils/Jar", () => ({
    openJar: async (name: string, blob: Blob) => ({
        name,
        blob,
        entries: { "Example.class": { crc32: 1, bytes: async () => new Uint8Array() } },
    }),
}));

import { DecompileWorker } from "./worker";

beforeEach(() => {
    vi.clearAllMocks();
    mocks.decompile.mockResolvedValue({ Example: "class Example {}" });
});

it("never reads or writes cached results while Unpick is enabled", async () => {
    const worker = new DecompileWorker();
    const config = { id: "project", definitions: [{ path: "flags.unpick", content: "unpick v4\n" }] };
    const libraries = { id: "libraries", files: [new File([], "runtime.jar")] };
    const jar = new Blob();

    const first = await worker.decompile(toClassName("Example"), "minecraft", jar, config, libraries);
    const second = await worker.decompile(toClassName("Example"), "minecraft", jar, config, libraries);

    expect(first.source).toBe("class Example {}");
    expect(second.source).toBe(first.source);
    expect(mocks.loadUnpick).toHaveBeenCalledTimes(2);
    expect(mocks.decompile).toHaveBeenCalledTimes(2);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.bulkPut).not.toHaveBeenCalled();
});

it.each([
    { definitions: [], files: [new File([], "runtime.jar")] },
    { definitions: [{ path: "flags.unpick", content: "unpick v4\n" }], files: [] },
])("does not initialize Unpick with empty definitions or libraries", async ({ definitions, files }) => {
    const worker = new DecompileWorker();
    const config = { id: "project", definitions };
    const libraries = { id: "libraries", files };

    await worker.decompile(toClassName("Example"), "minecraft", new Blob(), config, libraries);

    expect(mocks.loadUnpick).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.bulkPut).toHaveBeenCalledOnce();
});

it("uses the normal cache when Unpick is disabled", async () => {
    const cached = { source: "cached source" };
    mocks.get.mockResolvedValueOnce(cached);
    const worker = new DecompileWorker();

    const result = await worker.decompile(toClassName("Example"), "minecraft", new Blob());

    expect(result).toBe(cached);
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.decompile).not.toHaveBeenCalled();
});
