import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, shareReplay, switchMap, tap, Observable } from "rxjs";
import { agreedEula } from "./Settings";
import { openJar, type Jar } from "../utils/Jar";
import { selectedMinecraftVersion } from "./State";
import { remapMinecraftJar } from "../workers/remap/client";

const CACHE_NAME = 'mcsrc-v1';
const VERSIONS_URL = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

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
    map(versionsList => versionsList.versions),
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

export const REMAPPED_JAR_CACHE_VERSION = 1;

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

async function fetchVersions(): Promise<VersionsList> {
    const mojang = await getJson<VersionsList>(VERSIONS_URL);
    const filteredMojangVersions = mojang.versions.filter(v => {
        // Any version released after 2026 is deobfuscated
        if (new Date(v.releaseTime).getFullYear() >= 2026) return true;
        if (v.id === 'c0.0.13a' || v.id === 'c0.0.11a') return true;
        if (v.id.startsWith('rd-')) return true;
        return hasOfficialMappings(v);
    });
    const versions = filteredMojangVersions
        .concat(EXPERIMENTAL_VERSIONS.versions)
        .sort((a, b) => b.releaseTime.localeCompare(a.releaseTime));
    return {
        versions: versions
    };
}

const RELEASE_PATTERN = /^1\.\d+(\.\d+)?$/;
const SNAPSHOT_PATTERN = /^\d{2}w\d{2}[a-z]$/;

function hasOfficialMappings(version: VersionListEntry): boolean {
    if (version.type === "release" && RELEASE_PATTERN.test(version.id)) {
        const match = version.id.match(/^1\.(\d+)(?:\.(\d+))?$/);
        if (!match) return false;

        const minor = parseInt(match[1], 10);
        const patch = match[2] ? parseInt(match[2], 10) : 0;
        return minor > 14 || (minor === 14 && patch >= 4);
    }

    if (version.type === "snapshot" && SNAPSHOT_PATTERN.test(version.id)) {
        const match = version.id.match(/^(\d{2})w(\d{2})[a-z]$/);
        if (!match) return false;

        const year = parseInt(match[1], 10) + 2000;
        const week = parseInt(match[2], 10);
        return year > 2019 || (year === 2019 && week >= 36);
    }

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

        await cache?.put(cacheKey, new Response(blob));
        return { blob, remapped: true };
    } finally {
        remapProgress.next(undefined);
    }
}

// Hardcode as these are never going to change.
const EXPERIMENTAL_VERSIONS: VersionsList = {
    versions: [
        {
            id: "25w45a_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/25w45a_unobfuscated.json",
            time: "2025-11-04T14:07:08+00:00",
            releaseTime: "2025-11-04T14:07:08+00:00",
            sha1: "7a3c149f148b6aa5ac3af48c4f701adea7e5b615",
        },
        {
            id: "25w46a_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/25w46a_unobfuscated.json",
            time: "2025-11-11T13:20:54+00:00",
            releaseTime: "2025-11-11T13:20:54+00:00",
            sha1: "314ade2afeada364047798e163ef8e82427c69e1",
        },
        {
            id: "1.21.11-pre1_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-pre1_unobfuscated.json",
            time: "2025-11-19T08:30:46+00:00",
            releaseTime: "2025-11-19T08:30:46+00:00",
            sha1: "9c267f8dda2728bae55201a753cdd07b584709f1",
        },
        {
            id: "1.21.11-pre2_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-pre2_unobfuscated.json",
            time: "2025-11-21T12:07:21+00:00",
            releaseTime: "2025-11-21T12:07:21+00:00",
            sha1: "2955ce0af0512fdfe53ff0740b017344acf6f397",
        },
        {
            id: "1.21.11-pre3_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-pre3_unobfuscated.json",
            time: "2025-11-25T14:14:30+00:00",
            releaseTime: "2025-11-25T14:14:30+00:00",
            sha1: "579bf3428f72b5ea04883d202e4831bfdcb2aa8d",
        },
        {
            id: "1.21.11-pre4_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-pre4_unobfuscated.json",
            time: "2025-12-01T13:40:12+00:00",
            releaseTime: "2025-12-01T13:40:12+00:00",
            sha1: "410ce37a2506adcfd54ef7d89168cfbe89cac4cb",
        },
        {
            id: "1.21.11-pre5_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-pre5_unobfuscated.json",
            time: "2025-12-03T13:34:06+00:00",
            releaseTime: "2025-12-03T13:34:06+00:00",
            sha1: "1028441ca6d288bbf2103e773196bf524f7260fd",
        },
        {
            id: "1.21.11-rc1_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-rc1_unobfuscated.json",
            time: "2025-12-04T15:56:55+00:00",
            releaseTime: "2025-12-04T15:56:55+00:00",
            sha1: "5d3ee0ef1f0251cf7e073354ca9e085a884a643d",
        },
        {
            id: "1.21.11-rc2_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-rc2_unobfuscated.json",
            time: "2025-12-05T11:57:45+00:00",
            releaseTime: "2025-12-05T11:57:45+00:00",
            sha1: "9282a3fb154d2a425086c62c11827281308bf93b",
        },
        {
            id: "1.21.11-rc3_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11-rc3_unobfuscated.json",
            time: "2025-12-08T13:59:34+00:00",
            releaseTime: "2025-12-08T13:59:34+00:00",
            sha1: "ce3f7ac6d0e9d23ea4e5f0354b91ff15039d9931",
        },
        {
            id: "1.21.11_unobfuscated",
            type: "unobfuscated",
            url: "https://maven.fabricmc.net/net/minecraft/1_21_11_unobfuscated.json",
            time: "2025-12-09T12:43:15+00:00",
            releaseTime: "2025-12-09T12:43:15+00:00",
            sha1: "327be7759157b04495c591dbb721875e341877af",
        }
    ]
};
