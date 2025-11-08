import { BehaviorSubject, distinctUntilChanged, filter, from, map, shareReplay, switchMap, tap } from "rxjs";
import JSZip from 'jszip';
import { agreedEula } from "./Settings";

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

export const minecraftVersions = new BehaviorSubject<VersionListEntry[]>([]);
export const minecraftVersionIds = minecraftVersions.pipe(
    map(versions => versions.map(v => v.id))
);
export const selectedMinecraftVersion = new BehaviorSubject<string | null>(null);

// Refresh the Minecraft jar when the selected version changes
export const minecraftJarBlob = selectedMinecraftVersion.pipe(
    filter(id => id !== null),
    distinctUntilChanged(),
    map(versionId => {
        return getVersionEntryById(versionId!)!;
    }),
    switchMap(versionEntry => {
        return from(downloadMinecraftJar(versionEntry));
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);

export const minecraftJar = minecraftJarBlob.pipe(
    tap(() => console.log('Loading Minecraft jar')),
    switchMap(blob => from(JSZip.loadAsync(blob))),
    shareReplay({ bufferSize: 1, refCount: false })
);

export const downloadProgress = new BehaviorSubject<number | undefined>(undefined);

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
        return cachedResponse
    };

    const response = await fetch(url);
    if (response.ok) {
        cache.put(url, response.clone());
    }
    return response;
}

async function downloadMinecraftJar(version: VersionListEntry): Promise<Blob> {
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
        downloadProgress.next(undefined);
        return blob;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const progress = Math.round((receivedLength / total) * 100);
        downloadProgress.next(progress);
    }

    const blob = new Blob(chunks);
    downloadProgress.next(undefined)
    return blob;
}

async function initialize() {
    const versionsList = await fetchVersions();
    const debofVersions = versionsList.versions.filter(v => v.type === "unobfuscated").reverse();
    minecraftVersions.next(debofVersions);

    // This triggers the download
    selectedMinecraftVersion.next(debofVersions[0].id);
}

let hasInitialized = false;

// Automatically download the Minecraft jar only when the user has agreed to the EULA
agreedEula.observable.subscribe(seen => {
    if (seen && !hasInitialized) {
        hasInitialized = true;
        initialize();
    }
});
