import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./Javadoc", async () => {
    const { BehaviorSubject } = await import("rxjs");
    return {
        activateJavadocFile: vi.fn(),
        activeJavadocFile: new BehaviorSubject(null),
        javadocRevision: new BehaviorSubject(0),
    };
});

vi.mock("./JavadocStorage", () => ({
    ensureJavadocBridge: vi.fn(async () => ({})),
    clearStoredJavadocs: vi.fn(),
    storeJavadocClassMapping: vi.fn(),
}));

vi.mock("../logic/State", async () => {
    const { BehaviorSubject } = await import("rxjs");
    return {
        selectedFile: new BehaviorSubject(null),
        selectedMinecraftVersion: new BehaviorSubject(null),
    };
});

import { connectJavadocServer } from "./JavadocServer";

const HOST = "http://127.0.0.1:8000";

interface RecordedRequest {
    path: string;
    method: string;
    body?: string;
}

let requests: RecordedRequest[];
let routes: Record<string, () => Response>;

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function unpickFiles(files: Record<string, string>) {
    routes[`/unpick/list`] = () => json({ entries: Object.keys(files).map(path => ({ path, modifiedTime: 0 })) });

    for (const [path, content] of Object.entries(files)) {
        routes[`/unpick?${path}`] = () => new Response(content, { status: 200 });
    }
}

function connect(config: unknown = { version: "1.21.5", runtimeLibraries: [] }) {
    routes["/config"] = () => json(config);
    return connectJavadocServer(HOST);
}

beforeEach(() => {
    requests = [];
    routes = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        const { pathname, search } = new URL(url);
        const method = init?.method ?? "GET";
        requests.push({ path: `${pathname}${search}`, method, body: init?.body as string | undefined });

        const route = routes[`${pathname}${search}`];
        return route ? route() : json({ details: "Not found" }, 404);
    }));
});

describe("connectJavadocServer", () => {
    it("loads the config, the runtime libraries and the unpick files", async () => {
        routes["/library?nested/lib.jar"] = () => new Response(new Uint8Array([1, 2, 3]));
        unpickFiles({ "Foo.unpick": "unpick v4\n" });

        const { source, version } = await connect({ version: "1.21.5", runtimeLibraries: ["nested/lib.jar"] });

        expect(version).toBe("1.21.5");
        expect(source.runtimeLibraries?.files.map(file => file.name)).toEqual(["nested/lib.jar"]);
        expect(source.unpick?.definitions).toEqual([{ path: "Foo.unpick", content: "unpick v4\n" }]);
        expect(source.unpickFiles).toBeDefined();
    });

    it("rejects a config without runtime library paths", async () => {
        await expect(connect({ version: "1.21.5" })).rejects.toThrow(/"runtimeLibraries"/);
    });

    it("leaves runtime libraries and unpick undefined when the server has none", async () => {
        unpickFiles({});

        const { source } = await connect();

        expect(source.runtimeLibraries).toBeUndefined();
        expect(source.unpick).toBeUndefined();
    });
});

describe("server unpick files", () => {
    it("posts a new file", async () => {
        unpickFiles({});
        const { source } = await connect();
        routes["/unpick"] = () => json({ details: "Unpick updated" });

        await source.unpickFiles!.write("New.unpick", undefined, "unpick v4\n");

        expect(requests.at(-1)).toEqual({
            path: "/unpick",
            method: "POST",
            body: JSON.stringify({ path: "New.unpick", content: "unpick v4\n" }),
        });
    });

    it("rejects a write when the file changed elsewhere", async () => {
        unpickFiles({ "Foo.unpick": "on disk" });
        const { source } = await connect();

        await expect(source.unpickFiles!.write("Foo.unpick", "stale", "mine")).rejects.toThrow("changed on disk");
        expect(requests.some(request => request.method === "POST")).toBe(false);
    });

    it("rejects creating a file that already exists", async () => {
        unpickFiles({ "Foo.unpick": "on disk" });
        const { source } = await connect();

        await expect(source.unpickFiles!.write("Foo.unpick", undefined, "mine")).rejects.toThrow("already exists");
    });

    it("deletes a file", async () => {
        unpickFiles({ "Foo.unpick": "on disk" });
        const { source } = await connect();

        await source.unpickFiles?.delete("Foo.unpick", "on disk");

        expect(requests.at(-1)).toEqual({ path: "/unpick?Foo.unpick", method: "DELETE", body: undefined });
    });

    it("rejects deleting a file that changed elsewhere", async () => {
        unpickFiles({ "Foo.unpick": "on disk" });
        const { source } = await connect();

        await expect(source.unpickFiles?.delete("Foo.unpick", "stale")).rejects.toThrow("changed on disk");
        expect(requests.some(request => request.method === "DELETE")).toBe(false);
    });
});
