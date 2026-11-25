import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, EMPTY, exhaustMap, filter, from, map, switchMap, timer } from "rxjs";
import { activateJavadocFile, activeJavadocFile, javadocRevision } from "./Javadoc";
import {
    clearStoredJavadocs,
    ensureJavadocBridge,
    storeJavadocClassMapping,
    type JavadocServerSource,
    type JavadocTarget,
} from "./JavadocStorage";
import type { UnpickFileStore } from "../unpick/UnpickFiles";
import { classNameFromClassFilePath, outerClassName, type ClassName } from "../utils/Names";
import { selectedFile, selectedMinecraftVersion } from "../logic/State";

export interface JavadocServerConfig {
    source: JavadocServerSource;
    version: string;
}

export async function connectAnnotaterServer(host: string): Promise<JavadocServerSource> {
    const config = await connectJavadocServer(host);
    selectedMinecraftVersion.next(config.version);
    activateJavadocFile(config.source);
    return config.source;
}

export async function connectJavadocServer(host: string): Promise<JavadocServerConfig> {
    const normalizedHost = parseServerHost(host);
    await ensureJavadocBridge();

    const response = await fetch(`${normalizedHost}/config`);

    if (!response.ok) {
        throw await serverResponseError(response);
    }

    const config: unknown = await response.json();

    if (typeof config !== "object" || config === null
        || !("version" in config) || typeof config.version !== "string" || !config.version.trim()
        || !("runtimeLibraries" in config) || !isStringArray(config.runtimeLibraries)) {
        throw new Error('The annotater server config must contain a Minecraft "version" and "runtimeLibraries" paths.');
    }

    return {
        source: await readServerAnnotaterSource(normalizedHost, config.runtimeLibraries),
        version: config.version,
    };
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(path => typeof path === "string");
}

async function readServerAnnotaterSource(host: string, runtimeLibraryPaths: string[]): Promise<JavadocServerSource> {
    const unpickFiles = serverUnpickFiles(host);
    const definitions = await unpickFiles.read();
    const source: JavadocServerSource = { kind: "server", host, unpickFiles };

    if (runtimeLibraryPaths.length > 0) {
        const files = await Promise.all(runtimeLibraryPaths.map(async path => {
            const response = await fetch(`${host}/library?${path}`);

            if (!response.ok) {
                throw await serverResponseError(response);
            }

            return new File([await response.blob()], path, { type: "application/java-archive" });
        }));
        source.runtimeLibraries = { id: crypto.randomUUID(), files };
    }

    if (definitions.length > 0) {
        source.unpick = { id: crypto.randomUUID(), definitions };
    }

    return source;
}

function serverUnpickFiles(host: string): UnpickFileStore {
    return {
        read: async () => {
            const response = await fetch(`${host}/unpick/list`);

            if (!response.ok) {
                throw await serverResponseError(response);
            }

            const { entries } = await response.json() as { entries: { path: string }[] };
            return Promise.all(entries.map(async ({ path }) => ({
                path,
                content: await fetchUnpickContent(host, path) ?? "",
            })));
        },
        write: async (path, previous, content) => {
            await requireUnpickContent(host, path, previous);

            const response = await fetch(`${host}/unpick`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path, content } satisfies UpdateUnpickRequest),
            });

            if (!response.ok) {
                throw await serverResponseError(response);
            }
        },
        delete: async (path, previous) => {
            await requireUnpickContent(host, path, previous);

            const response = await fetch(`${host}/unpick?${path}`, { method: "DELETE" });

            if (!response.ok) {
                throw await serverResponseError(response);
            }
        },
    };
}

/** Rejects the edit when the file on the server is not the content the editor last read. */
async function requireUnpickContent(host: string, path: string, previous: string | undefined): Promise<void> {
    const existing = await fetchUnpickContent(host, path);

    if (existing !== previous) {
        throw new Error(previous === undefined ? `${path} already exists.` : `${path} changed on disk.`);
    }
}

async function fetchUnpickContent(host: string, path: string): Promise<string | undefined> {
    const response = await fetch(`${host}/unpick?${path}`);

    if (response.status === 404) return undefined;

    if (!response.ok) {
        throw await serverResponseError(response);
    }

    return await response.text();
}

export async function readServerJavadocClass(
    source: JavadocServerSource,
    owner: ClassName,
    request: number,
): Promise<void> {
    await ensureJavadocBridge();

    const response = await fetch(`${source.host}/mapping?${owner}`);

    if (request !== serverClassRequest) return;

    if (response.status === 404) {
        clearStoredJavadocs();
        return;
    }

    if (!response.ok) {
        throw await serverResponseError(response);
    }

    const mappings = await response.text();
    if (request !== serverClassRequest) return;

    if (!mappings.trim()) {
        clearStoredJavadocs();
        return;
    }

    storeJavadocClassMapping(textToArrayBuffer(mappings), `${owner}.mapping`);
}

export async function writeServerJavadoc(
    source: JavadocServerSource,
    target: JavadocTarget,
    comment: string | null,
): Promise<void> {
    const response = await fetch(`${source.host}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            className: target.owner,
            kind: SERVER_ELEMENT_KINDS[target.kind],
            name: target.name,
            desc: target.descriptor,
            comments: comment ?? "",
        } satisfies UpdateMappingRequest),
    });

    if (!response.ok) {
        throw await serverResponseError(response);
    }
}

const SERVER_ELEMENT_KINDS = ["CLASS", "FIELD", "METHOD"] as const;

let serverClassRequest = 0;

interface UpdateMappingRequest {
    className: string;
    kind: (typeof SERVER_ELEMENT_KINDS)[number];
    name: string;
    desc: string;
    comments: string;
}

interface UpdateUnpickRequest {
    path: string;
    content: string;
}

function parseServerHost(host: string): string {
    let url: URL;

    try {
        url = new URL(host.trim());
    } catch {
        throw new Error("The annotater server host must be an absolute http or https URL.");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("The annotater server host must be an absolute http or https URL.");
    }

    return url.toString().replace(/\/+$/, "");
}

async function serverResponseError(response: Response): Promise<Error> {
    let details = `HTTP ${response.status}`;

    try {
        const body: unknown = await response.json();

        if (typeof body === "object" && body !== null && "details" in body && typeof body.details === "string") {
            details = body.details;
        }
    } catch {
        // Keep the status code as the error message.
    }

    return new Error(details);
}

function textToArrayBuffer(text: string): ArrayBuffer {
    const bytes = new TextEncoder().encode(text);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

// Unlike directory sources, the server cannot be enumerated up front and every edit is persisted
// immediately, so the Javadoc storage only holds the mapping of the currently viewed class.
// Whenever it changes, its mapping is fetched and the editors are republished.
combineLatest([activeJavadocFile, selectedFile]).pipe(
    map(([source, file]) => ({
        source: source?.kind === "server" ? source : null,
        owner: file ? outerClassName(classNameFromClassFilePath(file)) : null,
    })),
    distinctUntilChanged((previous, current) => previous.source === current.source && previous.owner === current.owner),
    switchMap(({ source, owner }) => {
        // Invalidates any in-flight fetch of a previous source or class before starting a new one.
        const request = ++serverClassRequest;

        if (!source || !owner) return EMPTY;

        return from(readServerJavadocClass(source, owner, request)).pipe(
            catchError(error => {
                console.error("Unable to load Javadoc mappings from the annotater server", error);
                return EMPTY;
            }),
            map(() => source),
        );
    }),
    filter(source => source === activeJavadocFile.value),
).subscribe(() => {
    javadocRevision.next(javadocRevision.value + 1);
});

export const annotaterServerOffline = new BehaviorSubject<string | null>(null);
const SERVER_PING_INTERVAL = 5000;

async function pingServer(source: JavadocServerSource): Promise<void> {
    const response = await fetch(`${source.host}/ping`);

    if (!response.ok) {
        throw await serverResponseError(response);
    }
}

// Periodically ping the server.
activeJavadocFile.pipe(
    map(source => source?.kind === "server" ? source : null),
    distinctUntilChanged(),
    switchMap(source => {
        annotaterServerOffline.next(null);

        if (!source) return EMPTY;

        return timer(SERVER_PING_INTERVAL, SERVER_PING_INTERVAL).pipe(
            exhaustMap(async () => {
                try {
                    await pingServer(source);

                    if (activeJavadocFile.value === source && annotaterServerOffline.value !== null) {
                        annotaterServerOffline.next(null);
                    }
                } catch (error) {
                    console.warn("The annotater server is unreachable", error);

                    if (activeJavadocFile.value === source && annotaterServerOffline.value === null) {
                        annotaterServerOffline.next(error instanceof Error ? error.message : String(error));
                    }
                }
            }),
        );
    }),
).subscribe();

export function autoConnectAnnotaterServer(): void {
    const host = new URLSearchParams(window.location.search).get("annotater-server");

    if (host) {
        connectAnnotaterServer(host).catch(error => {
            console.error("Unable to connect to the annotater server", error);
        });
    }
}
