import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, map, of, shareReplay, startWith, switchMap, type Observable } from "rxjs";
import {
    fetchJavaRuntimes, fetchLauncherVersionManifest, fetchLauncherVersions,
    type JavaRuntimes, type Json, type Manifest, type VersionListEntry,
} from "./MinecraftApi";
import { selectedMinecraftVersion } from "./State";

interface LauncherSelection {
    tab: "versions" | "java";
    view: "summary" | "json";
    changesOnly: boolean;
    platform: string;
}

type LoadState<T> = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

export const launcherMetaOpen = new BehaviorSubject(false);
export const launcherLeftVersion = new BehaviorSubject<string | null>(null);
export const launcherRightVersion = new BehaviorSubject<string | null>(null);
export const expandedLauncherLibraries = new BehaviorSubject<string[]>([]);
export const launcherRuntimeSort = new BehaviorSubject<{ column: string; order: "ascend" | "descend" } | null>(null);
export const launcherSelection = new BehaviorSubject<LauncherSelection>({
    tab: "versions",
    view: "summary",
    changesOnly: true,
    platform: "all",
});

export function updateLauncherSelection(update: Partial<LauncherSelection>) {
    launcherSelection.next({ ...launcherSelection.value, ...update });
}

export function openLauncherMeta() {
    if (launcherLeftVersion.value === null) {
        launcherLeftVersion.next(selectedMinecraftVersion.value);
    }
    launcherMetaOpen.next(true);
}

function loadingState<T>() {
    return (source: Observable<T>) => source.pipe(
        map(data => ({ status: "ready", data }) as LoadState<T>),
        startWith({ status: "loading" } as LoadState<T>),
        catchError((error: unknown) => of<LoadState<T>>({
            status: "error",
            error: error instanceof Error ? error.message : String(error),
        })),
    );
}

export const launcherVersions = launcherMetaOpen.pipe(
    switchMap(open => {
        if (!open) {
            return of<LoadState<VersionListEntry[]>>({ status: "loading" });
        }
        return fetchLauncherVersions().pipe(loadingState());
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
);

export const launcherVersionList = launcherVersions.pipe(
    map(state => state.status === "ready" ? state.data : []),
);

function versionMetadata(side: "left" | "right") {
    const selectedVersion = side === "left" ? launcherLeftVersion : launcherRightVersion;
    return combineLatest([
        launcherVersions,
        selectedVersion.pipe(distinctUntilChanged()),
    ]).pipe(
        switchMap(([versions, versionId]) => {
            if (versions.status !== "ready") {
                return of<LoadState<Manifest | null>>(versions);
            }
            if (!versionId && side === "right") {
                return of<LoadState<Manifest | null>>({ status: "ready", data: null });
            }
            let version = versions.data.find(entry => entry.id === versionId);
            if (!version && !versionId) {
                version = versions.data[0];
            }
            if (!version) {
                return of<LoadState<Manifest | null>>({ status: "error", error: `Version not found: ${versionId}` });
            }
            return fetchLauncherVersionManifest(version).pipe(loadingState());
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
    );
}

export const launcherLeft = versionMetadata("left");
export const launcherRight = versionMetadata("right");

export const launcherRuntimes = combineLatest([
    launcherMetaOpen,
    launcherSelection.pipe(map(selection => selection.tab), distinctUntilChanged()),
]).pipe(
    switchMap(([open, tab]) => {
        if (!open || tab !== "java") {
            return of<LoadState<{ data: JavaRuntimes; lastModified: string | null }>>({ status: "loading" });
        }
        return fetchJavaRuntimes().pipe(loadingState());
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
);

// Sort object keys for semantic comparisons while preserving meaningful array order.
function canonicalJson(value: Json | undefined): string {
    if (value === undefined) {
        return "";
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJson).join(",")}]`;
    }
    if (value !== null && typeof value === "object") {
        const sortedKeys = Object.keys(value).sort();
        const entries = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
        return `{${entries.join(",")}}`;
    }
    return JSON.stringify(value);
}

export interface MetadataRow {
    key: string;
    label: string;
    section: "Options" | "Libraries" | "Game arguments" | "JVM arguments";
    left?: Json;
    right?: Json;
    status: "added" | "removed" | "changed" | "unchanged";
}

export function libraryVersions(value: Json | undefined): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const names: string[] = [];
    for (const entry of value) {
        if (entry !== null && typeof entry === "object" && !Array.isArray(entry) && typeof entry.name === "string") {
            names.push(entry.name);
        }
    }
    const mainNames = names.filter(name => name.split(":").length === 3);
    const versionNames = mainNames.length ? mainNames : names;
    return [...new Set(versionNames.map(name => name.split(":")[2]?.split("@")[0] ?? "Unknown"))];
}

export type LibraryVersionChange = "major" | "minor" | "patch" | "qualifier" | "revision" | "version";

export function compareLibraryVersion(version: string, other?: string): LibraryVersionChange | null {
    if (other === undefined || version === other) {
        return null;
    }
    const numericVersion = /^(?<major>\d+)(?:\.(?<minor>\d+))?(?:\.(?<patch>\d+))?(?<suffix>.*)$/;
    const current = version.match(numericVersion)?.groups;
    const previous = other.match(numericVersion)?.groups;
    let kind: LibraryVersionChange = "version";
    if (current && previous) {
        if (current.major !== previous.major) {
            kind = "major";
        } else if (current.minor !== previous.minor) {
            kind = "minor";
        } else if (current.patch !== previous.patch) {
            kind = "patch";
        } else if (/^\.\d/.test(current.suffix) || /^\.\d/.test(previous.suffix)) {
            kind = "revision";
        } else {
            kind = "qualifier";
        }
    }
    return kind;
}

function flattenOptions(manifest: Manifest): Map<string, Json> {
    const options = new Map<string, Json>();
    function visit(path: string, value: Json) {
        if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0) {
            for (const [key, child] of Object.entries(value)) {
                visit(`${path}.${key}`, child);
            }
        } else {
            options.set(path, value);
        }
    }
    for (const [key, value] of Object.entries(manifest)) {
        if (["libraries", "arguments", "minecraftArguments", "assetIndex", "assets"].includes(key)) {
            continue;
        }
        visit(key, value);
    }
    const argumentsObject = manifest.arguments;
    if (argumentsObject !== null && typeof argumentsObject === "object" && !Array.isArray(argumentsObject)) {
        for (const [key, value] of Object.entries(argumentsObject)) {
            if (!["game", "jvm", "default-user-jvm"].includes(key)) {
                visit(`arguments.${key}`, value);
            }
        }
    }
    if (manifest.assetIndex !== undefined || manifest.assets !== undefined) {
        const assetIndex = manifest.assetIndex;
        let assetId = manifest.assets;
        if (assetIndex !== null && typeof assetIndex === "object" && !Array.isArray(assetIndex)) {
            assetId = assetIndex.id ?? assetId;
        }
        options.set("Assets", assetId ?? "Present");
    }
    return options;
}

function groupLibraries(manifest: Manifest): Map<string, Manifest[]> {
    const entries = new Map<string, Manifest[]>();
    if (!Array.isArray(manifest.libraries)) {
        return entries;
    }
    for (const library of manifest.libraries) {
        if (library === null || typeof library !== "object" || Array.isArray(library)) {
            continue;
        }
        const name = String(library.name);
        const [group, artifact] = name.split(":");
        const identity = `${group}:${artifact}`;
        const variants = entries.get(identity) ?? [];
        variants.push(library);
        entries.set(identity, variants);
    }
    // Manifest ordering does not change the contents of a library's classifier variants.
    for (const variants of entries.values()) {
        variants.sort((left, right) => {
            const leftClassifier = String(left.name).split(":").slice(3).join(":");
            const rightClassifier = String(right.name).split(":").slice(3).join(":");
            const classifierOrder = leftClassifier.localeCompare(rightClassifier);
            if (classifierOrder !== 0) {
                return classifierOrder;
            }
            return canonicalJson(left).localeCompare(canonicalJson(right));
        });
    }
    return entries;
}

function argumentsFor(manifest: Manifest, kind: "game" | "jvm"): Json[] {
    const argumentsObject = manifest.arguments;
    if (argumentsObject !== null && typeof argumentsObject === "object" && !Array.isArray(argumentsObject)) {
        if (kind === "jvm") {
            const jvmArguments = Array.isArray(argumentsObject.jvm) ? argumentsObject.jvm : [];
            const defaultUserArguments = Array.isArray(argumentsObject["default-user-jvm"]) ? argumentsObject["default-user-jvm"] : [];
            return [...jvmArguments, ...defaultUserArguments];
        }
        if (Array.isArray(argumentsObject.game)) {
            return argumentsObject.game;
        }
    }
    if (kind === "game" && typeof manifest.minecraftArguments === "string") {
        const argumentsText = manifest.minecraftArguments.trim();
        return argumentsText ? argumentsText.split(/\s+/) : [];
    }
    return [];
}

export function compareMetadata(left: Manifest, right?: Manifest): MetadataRow[] {
    const rows: MetadataRow[] = [];
    function addRow(section: MetadataRow["section"], label: string, before?: Json, after?: Json) {
        let status: MetadataRow["status"] = "unchanged";
        if (right) {
            if (before === undefined) {
                status = "added";
            } else if (after === undefined) {
                status = "removed";
            } else if (canonicalJson(before) !== canonicalJson(after)) {
                status = "changed";
            }
        }
        const key = section === "Libraries" ? `${section}:${label}` : `${section}:${rows.length}`;
        rows.push({ key, label, section, left: before, right: after, status });
    }
    const groups = [
        { section: "Options", before: flattenOptions(left), after: right ? flattenOptions(right) : new Map<string, Json>() },
        { section: "Libraries", before: groupLibraries(left), after: right ? groupLibraries(right) : new Map<string, Json>() },
    ] as const;
    for (const { section, before, after } of groups) {
        for (const key of new Set([...before.keys(), ...after.keys()])) {
            addRow(section, key, before.get(key), after.get(key));
        }
    }
    // Asset URLs/hashes can change without changing the asset index's display ID.
    const assetRow = rows.find(row => row.label === "Assets");
    if (right && assetRow && assetRow.status === "unchanged") {
        const indexChanged = canonicalJson(left.assetIndex) !== canonicalJson(right.assetIndex);
        const assetsChanged = canonicalJson(left.assets) !== canonicalJson(right.assets);
        if (indexChanged || assetsChanged) {
            assetRow.status = "changed";
        }
    }

    for (const kind of ["game", "jvm"] as const) {
        const before = argumentsFor(left, kind);
        const after = right ? argumentsFor(right, kind) : [];
        const section = kind === "game" ? "Game arguments" : "JVM arguments";
        if (!right) {
            for (const [index, value] of before.entries()) {
                addRow(section, String(index + 1), value);
            }
            continue;
        }
        const beforeKeys = before.map(canonicalJson);
        const afterKeys = after.map(canonicalJson);
        // Align arguments by their longest common subsequence so an insertion does not shift every row.
        const commonLengths = Array.from({ length: before.length + 1 }, () => new Uint32Array(after.length + 1));
        for (let beforeIndex = before.length - 1; beforeIndex >= 0; beforeIndex--) {
            for (let afterIndex = after.length - 1; afterIndex >= 0; afterIndex--) {
                if (beforeKeys[beforeIndex] === afterKeys[afterIndex]) {
                    commonLengths[beforeIndex][afterIndex] = commonLengths[beforeIndex + 1][afterIndex + 1] + 1;
                } else {
                    const lengthAfterRemoval = commonLengths[beforeIndex + 1][afterIndex];
                    const lengthAfterInsertion = commonLengths[beforeIndex][afterIndex + 1];
                    commonLengths[beforeIndex][afterIndex] = Math.max(lengthAfterRemoval, lengthAfterInsertion);
                }
            }
        }
        let beforeIndex = 0;
        let afterIndex = 0;
        while (beforeIndex < before.length || afterIndex < after.length) {
            const label = `${beforeIndex + 1} / ${afterIndex + 1}`;
            const hasBefore = beforeIndex < before.length;
            const hasAfter = afterIndex < after.length;
            if (hasBefore && hasAfter && beforeKeys[beforeIndex] === afterKeys[afterIndex]) {
                addRow(section, label, before[beforeIndex], after[afterIndex]);
                beforeIndex++;
                afterIndex++;
                continue;
            }
            const preferRemoval = hasBefore && (!hasAfter
                || commonLengths[beforeIndex + 1][afterIndex] >= commonLengths[beforeIndex][afterIndex + 1]);
            if (preferRemoval) {
                addRow(section, label, before[beforeIndex]);
                beforeIndex++;
            } else {
                addRow(section, label, undefined, after[afterIndex]);
                afterIndex++;
            }
        }
    }
    return rows;
}
