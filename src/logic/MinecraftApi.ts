import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, shareReplay, switchMap, tap, Observable } from "rxjs";
import { agreedEula } from "./Settings";
import { openJar, type Jar } from "../utils/Jar";
import { selectedMinecraftVersion } from "./State";
import { remapMinecraftJar } from "../workers/remap/client";

import EXPERIMENTAL_VERSIONS from "./experimental_versions.json";

const CACHE_NAME = 'mcsrc-v1';
const VERSIONS_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

interface VersionsList {
    versions: VersionListEntry[]
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
        client: VersionDownload;
        client_mappings?: VersionDownload;
        [key: string]: VersionDownload | undefined;
    };
}

interface VersionDownload {
    url: string;
    sha1?: string;
}

export interface MinecraftJar {
    version: string;
    jar: Jar;
    blob: Blob;
    metadata: MinecraftJarMetadata;
}

export interface MinecraftJarMetadata {
    clientSha1?: string;
    mappingsSha1?: string;
    remapped: boolean;
}

export const minecraftVersions = agreedEula.observable.pipe(
    filter(agreed => agreed),
    switchMap(() => from(fetchVersions())),
    tap(versions => {
        // On inital load, if we dont have a version selected or the selected version is not valid, default to the latest version.
        const currentVersion = selectedMinecraftVersion.value;
        const isValid = currentVersion !== null && versions.some(v => v.id === currentVersion);

        if (!isValid && versions.length > 0) {
            // Select the latest stable release version if it exists, otherwise fall back to the latest version
            const latestRelease = versions.find(v => v.type === "release");
            const defaultVersion = latestRelease ? latestRelease.id : versions[0].id;
            selectedMinecraftVersion.next(defaultVersion);
        }
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);

export const minecraftVersionIds = minecraftVersions.pipe(
    map(versions => versions.map(v => v.id))
);

export const downloadProgress = new BehaviorSubject<number | undefined>(undefined);
export const remapProgress = new BehaviorSubject<number | undefined>(undefined);

export const REMAPPED_JAR_CACHE_VERSION = 7;

export const minecraftJar = minecraftJarPipeline(selectedMinecraftVersion);
export function minecraftJarPipeline(source$: Observable<string | null>): Observable<MinecraftJar> {
    return combineLatest([
        source$.pipe(
            filter(id => id !== null),
            distinctUntilChanged()
        ),
        minecraftVersions
    ]).pipe(
        map(([version, versions]) => versions.find(v => v.id === version)),
        filter((version) => version !== undefined),
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

async function fetchVersions(): Promise<VersionListEntry[]> {
    const mojang = await getJson<VersionsList>(VERSIONS_URL);
    const allVersions = mojang.versions.concat(EXPERIMENTAL_VERSIONS.versions);
    const filteredVersions = allVersions.filter(isSupported);
    const versions = filteredVersions
        .sort((a, b) => b.releaseTime.localeCompare(a.releaseTime));
    return versions;
}

export function isUnobfuscated(version: VersionListEntry): boolean {
    // Not present in the official manifest, but used by entries in EXPERIMENTAL_VERSIONS
    if (version.type === 'unobfuscated') return true;
    // Any version released after 2025-12-16 is unobfuscated (starting from 26.1-snapshot-1)
    if (new Date(version.releaseTime) >= new Date("2025-12-16")) return true;
    if (version.id === 'c0.0.13a' || version.id === 'c0.0.11a') return true;
    if (version.id.startsWith('rd-')) return true;
    return false;
}

function isSupported(version: VersionListEntry): boolean {
    if(isUnobfuscated(version)) return true;
    // This version was released after the first snapshot with official mappings,
    // but its mappings were never published.
    if (version.id === '1.14_combat-3') return false;
    // Versions starting from 19w36a (released on 2019-09-04) have official mappings available
    if (new Date(version.releaseTime) >= new Date("2019-09-04")) return true;
    // Official mappings were backported to 1.14.4
    if (version.id === "1.14.4") return true;
    return false;
}

export function getRemappedJarCacheKey(version: string, client: VersionDownload, mappings: VersionDownload): string {
    const clientKey = client.sha1 ?? encodeURIComponent(client.url);
    const mappingsKey = mappings.sha1 ?? encodeURIComponent(mappings.url);
    return `https://mcsrc.dev/cache/remapped-jars/v${REMAPPED_JAR_CACHE_VERSION}/${version}/${clientKey}/${mappingsKey}.jar`;
}

async function fetchVersionManifest(version: VersionListEntry): Promise<VersionManifest> {
    return getJson<VersionManifest>(version.url);
}

async function cachedFetch(url: string, onProgress?: (percent: number) => void): Promise<Blob> {
    if (!('caches' in window)) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        return await consumeResponseWithProgress(response, onProgress);
    }

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
        return await cachedResponse.blob();
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const blob = await consumeResponseWithProgress(response, onProgress);

    // Cache the blob after it's been consumed
    await cache.put(url, new Response(blob, {
        headers: response.headers
    }));

    return blob;
}

async function consumeResponseWithProgress(response: Response, onProgress?: (percent: number) => void): Promise<Blob> {
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || total === 0 || !onProgress) {
        return await response.blob();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedLength = 0;
    let lastPercent = -1;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const percent = Math.round((receivedLength / total) * 100);

        if (percent !== lastPercent) {
            onProgress(percent);
            lastPercent = percent;
        }
    }

    return new Blob(chunks);
}

async function downloadMinecraftJar(version: VersionListEntry, progress: BehaviorSubject<number | undefined>): Promise<MinecraftJar> {
    console.log(`Downloading Minecraft jar for version: ${version.id}`);
    const versionManifest = await fetchVersionManifest(version);
    const client = versionManifest.downloads.client;
    const mappings = versionManifest.downloads.client_mappings;

    let rawBlob: Blob;
    let mappingsBlob: Blob | null;

    try {
        [rawBlob, mappingsBlob] = await Promise.all([
            cachedFetch(client.url, (percent) => {
                progress.next(percent);
            }),
            mappings ? cachedFetch(mappings.url) : Promise.resolve(null)
        ]);
    } finally {
        progress.next(undefined);
    }

    const { blob, remapped } = await prepareMinecraftJarBlob(version.id, rawBlob, client, mappingsBlob, mappings);
    const jar = await openJar(version.id, blob);
    return {
        version: version.id,
        jar,
        blob,
        metadata: {
            clientSha1: client.sha1,
            mappingsSha1: versionManifest.downloads.client_mappings?.sha1,
            remapped,
        },
    };
}

async function prepareMinecraftJarBlob(
    version: string,
    rawBlob: Blob,
    client: VersionDownload,
    mappingsBlob: Blob | null,
    mappings?: VersionDownload,
): Promise<{ blob: Blob, remapped: boolean; }> {
    if (!mappings || !mappingsBlob) {
        return { blob: rawBlob, remapped: false };
    }

    const cacheKey = getRemappedJarCacheKey(version, client, mappings);
    const cache = 'caches' in window ? await caches.open(CACHE_NAME) : null;
    const cachedResponse = await cache?.match(cacheKey);

    if (cachedResponse) {
        return { blob: await cachedResponse.blob(), remapped: true };
    }

    try {
        remapProgress.next(0);
        const blob = await remapMinecraftJar(version, rawBlob, mappingsBlob, percent => {
            remapProgress.next(percent);
        });

        try {
            await cache?.put(cacheKey, new Response(blob));
        } catch (error) {
            console.warn(`Failed to cache remapped jar for ${version}`, error);
        }

        return { blob, remapped: true };
    } finally {
        remapProgress.next(undefined);
    }
}
