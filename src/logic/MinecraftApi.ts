import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, shareReplay, switchMap, tap, Observable } from "rxjs";
import { agreedEula } from "./Settings";
import { state, updateSelectedMinecraftVersion } from "./State";
import { openJar, streamJar, type Jar } from "../utils/Jar";

const CACHE_NAME = 'mcsrc-v1';
const FABRIC_EXPERIMENTAL_VERSIONS_URL = "https://maven.fabricmc.net/net/minecraft/experimental_versions.json";

interface VersionsList {
    versions: VersionListEntry[];
}

interface VersionListEntry {
    id: string;
    type: string;
    url: string;
    time: string;
    releaseTime: string;
    sha1: string;
}

interface VersionManifest {
    id: string;
    downloads: {
        [key: string]: {
            url: string;
            sha1: string;
        };
    };
}

export interface MinecraftJar {
    version: string;
    jar: Jar;
}

export const minecraftVersions = new BehaviorSubject<VersionListEntry[]>([]);
export const minecraftVersionIds = minecraftVersions.pipe(
    map(versions => versions.map(v => v.id))
);
export const selectedMinecraftVersion = new BehaviorSubject<string | null>(null);

export const downloadProgress = new BehaviorSubject<number | undefined>(undefined);

export const minecraftJar = minecraftJarPipeline(selectedMinecraftVersion);
export function minecraftJarPipeline(source$: Observable<string | null>): Observable<MinecraftJar> {
    return source$.pipe(
        filter(id => id !== null),
        distinctUntilChanged(),
        tap(version => updateSelectedMinecraftVersion()),
        map(version => getVersionEntryById(version!)!),
        tap((version) => console.log(`Opening Minecraft jar ${version.id}`)),
        switchMap(version => from(downloadMinecraftJar(version, downloadProgress))),
        shareReplay({ bufferSize: 1, refCount: false })
    );
}

async function getJson<T>(url: string): Promise<T> {
    console.log(`Fetching JSON from ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch JSON from ${url}: ${response.statusText}`);
    }

    return response.json();
}

async function fetchVersions(): Promise<VersionsList> {
    return getJson<VersionsList>(FABRIC_EXPERIMENTAL_VERSIONS_URL);
}

async function fetchVersionManifest(version: VersionListEntry): Promise<VersionManifest> {
    return getJson<VersionManifest>(version.url);
}

function getVersionEntryById(id: string): VersionListEntry | undefined {
    const versions = minecraftVersions.value;
    return versions.find(v => v.id === id);
}

async function cachedFetch(url: string): Promise<Response> {
    if (!('caches' in window)) {
        return fetch(url);
    }

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
        return cachedResponse;
    };

    const response = await fetch(url);
    if (response.ok) {
        cache.put(url, response.clone());
    }
    return response;
}

async function downloadMinecraftJar(version: VersionListEntry, progress: BehaviorSubject<number | undefined>): Promise<MinecraftJar> {
    console.log(`Downloading Minecraft jar for version: ${version.id}`);
    const versionManifest = await fetchVersionManifest(version);
    const response = await cachedFetch(versionManifest.downloads.client.url);
    if (!response.ok) {
        throw new Error(`Failed to download Minecraft jar: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || total === 0) {
        const blob = await response.blob();
        const jar = await openJar(blob);
        progress.next(undefined);
        return { version: version.id, jar };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const percent = Math.round((receivedLength / total) * 100);
        progress.next(percent);
    }

    const blob = new Blob(chunks);
    const jar = await openJar(blob);
    progress.next(undefined);
    return { version: version.id, jar };
}

// TODO add an option to stream the Minecraft jar, this may add additional latency but will remove the inital large download time
async function streamMinecraftJar(version: VersionListEntry): Promise<MinecraftJar> {
    const versionManifest = await fetchVersionManifest(version);
    const jar = await streamJar(versionManifest.downloads.client.url);
    return { version: version.id, jar };
}

async function initialize(version: string | null = null) {
    const versionsList = await fetchVersions();
    const debofVersions = versionsList.versions.filter(v => v.type === "unobfuscated").reverse();
    minecraftVersions.next(debofVersions);

    // This triggers the download
    selectedMinecraftVersion.next(version || debofVersions[0].id);
}

let hasInitialized = false;

// Automatically download the Minecraft jar only when the user has agreed to the EULA
combineLatest([agreedEula.observable, state]).subscribe(([agreed, currentState]) => {
    if (agreed && !hasInitialized) {
        hasInitialized = true;
        initialize(currentState.minecraftVersion);
    }
});
