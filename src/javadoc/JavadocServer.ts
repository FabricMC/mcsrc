import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, EMPTY, filter, from, map, switchMap } from "rxjs";
import { activateJavadocFile, activeJavadocFile, javadocRevision } from "./Javadoc";
import {
    clearStoredJavadocs,
    ensureJavadocBridge,
    storeJavadocClassMapping,
    type JavadocServerSource,
    type JavadocTarget,
} from "./JavadocStorage";
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
        || !("version" in config) || typeof config.version !== "string" || !config.version.trim()) {
        throw new Error('The annotater server config must contain a Minecraft "version".');
    }

    return { source: { kind: "server", host: normalizedHost }, version: config.version };
}

export async function readServerJavadocClass(source: JavadocServerSource, owner: ClassName): Promise<void> {
    const request = ++serverClassRequest;
    await ensureJavadocBridge();

    const response = await fetch(`${source.host}/get-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ className: owner } satisfies GetMappingRequest),
    });

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
    const response = await fetch(`${source.host}/update-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            className: target.owner,
            kind: SERVER_ELEMENT_KINDS[target.kind],
            name: target.name,
            desc: target.descriptor,
            comments: comment,
        } satisfies UpdateMappingRequest),
    });

    if (!response.ok) {
        throw await serverResponseError(response);
    }
}

const SERVER_ELEMENT_KINDS = ["CLASS", "FIELD", "METHOD"] as const;

let serverClassRequest = 0;

interface GetMappingRequest {
    className: string;
}

interface UpdateMappingRequest {
    className: string;
    kind: (typeof SERVER_ELEMENT_KINDS)[number];
    name: string;
    desc: string;
    comments: string | null;
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
        if (!source || !owner) return EMPTY;

        return from(readServerJavadocClass(source, owner)).pipe(
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

// Any change of the active Javadoc source invalidates in-flight mapping loads,
// so they can no longer write into the storage of another source.
activeJavadocFile.pipe(distinctUntilChanged()).subscribe(() => {
    serverClassRequest++;
});

export function autoConnectAnnotaterServer(): void {
    const host = new URLSearchParams(window.location.search).get("annotater-server");

    if (host) {
        connectAnnotaterServer(host).catch(error => {
            console.error("Unable to connect to the annotater server", error);
        });
    }
}
