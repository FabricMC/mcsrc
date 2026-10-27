import {
    BehaviorSubject, catchError, combineLatest, concatMap, defer, distinctUntilChanged, EMPTY,
    filter, finalize, from, map, Observable, shareReplay, Subject, switchMap, tap, type Subscriber
} from "rxjs";
import { fromFetch } from "rxjs/fetch";
import { agreedEula } from "./Settings";
import { consumeResponseWithProgress, HttpStreamReader, openJar, type Jar } from "../utils/Jar";
import { read } from "@katana-project/zip";
import { selectedMinecraftVersion } from "./State";
import { remapMinecraftJar } from "../workers/remap/client";

import EXPERIMENTAL_VERSIONS from "./experimental_versions.json";
import { unwrapServerJar } from "../utils/ServerJar";
import { minecraftJarSide } from "../SiteConfig";

const CACHE_NAME = 'mcsrc-v1';
const VERSIONS_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const JAVA_RUNTIMES_URL = "https://piston-meta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Manifest = { [key: string]: Json };

export interface JavaRuntime {
    availability: { group: number; progress: number };
    manifest: { url: string; sha1: string; size: number };
    version: { name: string; released: string };
}

export type JavaRuntimes = Record<string, Record<string, JavaRuntime[]>>;

interface VersionsList {
    versions: VersionListEntry[]
}

export interface VersionListEntry {
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
        client?: VersionDownload;
        server?: VersionDownload;
        client_mappings?: VersionDownload;
        server_mappings?: VersionDownload;
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
    jarSha1?: string;
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

export interface MinecraftLoadProgress {
    version: string;
    stage: "downloading" | "remapping" | "opening";
    percent: number;
}

export const minecraftLoadProgress = new BehaviorSubject<MinecraftLoadProgress | undefined>(undefined);
export const queuedMinecraftVersions = new BehaviorSubject<string[]>([]);

interface MinecraftLoadRequest {
    version: VersionListEntry;
    subscriber: Subscriber<MinecraftJar>;
}

const minecraftLoadRequests = new Subject<MinecraftLoadRequest>();
const pendingMinecraftLoads = new Set<MinecraftLoadRequest>();

function updateQueuedVersions() {
    queuedMinecraftVersions.next(Array.from(pendingMinecraftLoads, request => request.version.id));
}

function removePendingLoad(request: MinecraftLoadRequest) {
    if (pendingMinecraftLoads.delete(request)) {
        updateQueuedVersions();
    }
}

minecraftLoadRequests.pipe(
    concatMap(request => {
        removePendingLoad(request);
        if (request.subscriber.closed) {
            return EMPTY;
        }

        // Keep the queue subscribed until the promise settles, even if the selected version changes.
        return defer(() => downloadMinecraftJar(request.version)).pipe(
            tap(request.subscriber),
            catchError(() => EMPTY),
            finalize(() => minecraftLoadProgress.next(undefined))
        );
    })
).subscribe();

function queueMinecraftJar(version: VersionListEntry): Observable<MinecraftJar> {
    return new Observable(subscriber => {
        const request = { version, subscriber };
        pendingMinecraftLoads.add(request);
        updateQueuedVersions();
        minecraftLoadRequests.next(request);
        return () => removePendingLoad(request);
    });
}

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
        switchMap(version => queueMinecraftJar(version)),
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

function loadMetadataJson<T>(url: string) {
    return fromFetch(url, {
        selector: async response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${url}`);
            }
            const data = await response.json() as T;
            return { data, lastModified: response.headers.get("Last-Modified") };
        },
    });
}

// Includes versions that cannot be opened by the decompiler.
export function fetchLauncherVersions(): Observable<VersionListEntry[]> {
    return loadMetadataJson<VersionsList>(VERSIONS_URL).pipe(
        map(({ data }) => {
            const versions = [...data.versions, ...EXPERIMENTAL_VERSIONS.versions];
            return versions.sort((left, right) => right.releaseTime.localeCompare(left.releaseTime));
        }),
    );
}

export function fetchLauncherVersionManifest(version: VersionListEntry): Observable<Manifest> {
    return loadMetadataJson<Manifest>(version.url).pipe(map(result => result.data));
}

export function fetchJavaRuntimes() {
    return loadMetadataJson<JavaRuntimes>(JAVA_RUNTIMES_URL);
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

export function getRemappedJarCacheKey(version: string, download: VersionDownload, mappings: VersionDownload): string {
    const jarKey = download.sha1 ?? encodeURIComponent(download.url);
    const mappingsKey = mappings.sha1 ?? encodeURIComponent(mappings.url);
    return `https://mcsrc.dev/cache/remapped-jars/v${REMAPPED_JAR_CACHE_VERSION}/${version}/${jarKey}/${mappingsKey}.jar`;
}

async function fetchVersionManifest(version: VersionListEntry): Promise<VersionManifest> {
    return getJson<VersionManifest>(version.url);
}

async function cachedFetch(url: string, onProgress?: (percent: number) => void): Promise<Blob> {
    const cache = 'caches' in window ? await caches.open(CACHE_NAME) : null;
    const cachedResponse = await cache?.match(url);
    if (cachedResponse) {
        return await cachedResponse.blob();
    }

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }

    const blob = await consumeResponseWithProgress(response, onProgress);

    // Cache the blob after it's been consumed
    await cache?.put(url, new Response(blob, {
        headers: response.headers
    }));

    return blob;
}

async function fetchServerJar(download: VersionDownload, onProgress: (percent: number) => void): Promise<Blob> {
    const cacheKey = `https://mcsrc.dev/cache/server-jars/v1/${download.sha1 ?? encodeURIComponent(download.url)}.jar`;
    const cache = 'caches' in window ? await caches.open(CACHE_NAME) : null;
    const cached = await cache?.match(cacheKey);
    if (cached) {
        return cached.blob();
    }

    let blob: Blob | undefined;
    try {
        const bundle = await read(new HttpStreamReader(download.url, onProgress));
        const nestedJar = bundle.entries.find(entry => entry.name.startsWith("META-INF/versions/") && entry.name.endsWith(".jar"));
        if (nestedJar) {
            blob = await nestedJar.blob();
        }
    } catch (error) {
        console.warn("Server jar range download failed, falling back to a full download", error);
    }

    if (!blob) {
        blob = await unwrapServerJar(await cachedFetch(download.url, onProgress));
    }
    await cache?.put(cacheKey, new Response(blob));
    return blob;
}

async function downloadMinecraftJar(version: VersionListEntry): Promise<MinecraftJar> {
    minecraftLoadProgress.next({ version: version.id, stage: "downloading", percent: 0 });
    console.log(`Downloading Minecraft jar for version: ${version.id}`);
    const versionManifest = await fetchVersionManifest(version);
    const download = versionManifest.downloads[minecraftJarSide];
    const mappings = versionManifest.downloads[`${minecraftJarSide}_mappings`];

    if (!download) {
        throw new Error(`No ${minecraftJarSide} jar available for Minecraft ${version.id}`);
    }

    const { blob, remapped } = await prepareMinecraftJarBlob(version.id, download, mappings);
    minecraftLoadProgress.next({ version: version.id, stage: "opening", percent: 100 });
    const jarName = minecraftJarSide === 'server' ? `${version.id}-server` : version.id;
    const jar = await openJar(jarName, blob);
    return {
        version: version.id,
        jar,
        blob,
        metadata: {
            jarSha1: download.sha1,
            mappingsSha1: mappings?.sha1,
            remapped,
        },
    };
}

async function prepareMinecraftJarBlob(
    version: string,
    download: VersionDownload,
    mappings?: VersionDownload,
): Promise<{ blob: Blob, remapped: boolean; }> {
    const cacheKey = mappings ? getRemappedJarCacheKey(version, download, mappings) : null;
    const cache = cacheKey && 'caches' in window ? await caches.open(CACHE_NAME) : null;
    const cachedResponse = cacheKey ? await cache?.match(cacheKey) : undefined;

    if (cachedResponse) {
        return { blob: await cachedResponse.blob(), remapped: true };
    }

    const onProgress = (percent: number) => {
        minecraftLoadProgress.next({ version, stage: "downloading", percent });
    };
    const [jarResult, mappingsResult] = await Promise.allSettled([
        minecraftJarSide === 'server' ? fetchServerJar(download, onProgress) : cachedFetch(download.url, onProgress),
        mappings ? cachedFetch(mappings.url) : Promise.resolve(null)
    ]);

    // Both requests must settle before releasing the queue, including on download failure.
    if (jarResult.status === "rejected") {
        throw jarResult.reason;
    }
    if (mappingsResult.status === "rejected") {
        throw mappingsResult.reason;
    }

    const rawBlob = jarResult.value;
    const mappingsBlob = mappingsResult.value;
    if (!mappingsBlob) {
        return { blob: rawBlob, remapped: false };
    }

    minecraftLoadProgress.next({ version, stage: "remapping", percent: 0 });
    const blob = await remapMinecraftJar(version, rawBlob, mappingsBlob, percent => {
        minecraftLoadProgress.next({ version, stage: "remapping", percent });
    });

    try {
        if (cacheKey) {
            await cache?.put(cacheKey, new Response(blob));
        }
    } catch (error) {
        console.warn(`Failed to cache remapped jar for ${version}`, error);
    }

    return { blob, remapped: true };
}
