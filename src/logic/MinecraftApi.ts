import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, shareReplay, switchMap, tap, Observable } from "rxjs";
import { agreedEula } from "./Settings";
import { state, updateSelectedMinecraftVersion } from "./State";
import { openJar, type Jar } from "../utils/Zip";

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
        switchMap(version => from(openMinecraftJar(version))),
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

async function openMinecraftJar(version: VersionListEntry): Promise<MinecraftJar> {
    const versionManifest = await fetchVersionManifest(version);
    const jar = await openJar(versionManifest.downloads.client.url);
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
