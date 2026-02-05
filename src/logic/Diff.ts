import { BehaviorSubject, combineLatest, from, map, Observable, switchMap } from "rxjs";
import { minecraftJar, minecraftJarPipeline, selectedMinecraftVersion, type MinecraftJar } from "./MinecraftApi";
import { currentResult, decompileResultPipeline } from "./Decompiler";
import type { DecompileResult } from "../workers/decompile/types";

export const diffView = new BehaviorSubject<boolean>(false);
export const hideUnchangedSizes = new BehaviorSubject<boolean>(false);

export interface EntryInfo {
    crcs: number[];
    totalUncompressedSize: number;
}

export interface DiffSide {
    selectedVersion: BehaviorSubject<string | null>;
    jar: Observable<MinecraftJar>;
    entries: Observable<Map<string, EntryInfo>>;
    result: Observable<DecompileResult>;
}

export const leftDownloadProgress = new BehaviorSubject<number | undefined>(undefined);

let leftDiff: DiffSide | null = null;
export function getLeftDiff(): DiffSide {
    if (!leftDiff) {
        leftDiff = {} as DiffSide;
        leftDiff.selectedVersion = new BehaviorSubject<string | null>(null);
        leftDiff.jar = minecraftJarPipeline(leftDiff.selectedVersion);
        leftDiff.entries = leftDiff.jar.pipe(
            switchMap(jar => from(getEntriesWithCRC(jar)))
        );
        leftDiff.result = decompileResultPipeline(leftDiff.jar);
    }
    return leftDiff;
}

let rightDiff: DiffSide | null = null;
export function getRightDiff(): DiffSide {
    if (!rightDiff) {
        rightDiff = {
            selectedVersion: selectedMinecraftVersion,
            jar: minecraftJar,
            entries: minecraftJar.pipe(
                switchMap(jar => from(getEntriesWithCRC(jar)))
            ),
            result: currentResult
        };
    }
    return rightDiff;
}

let diffChanges: Observable<Map<string, ChangeState>> | null = null;
export function getDiffChanges(): Observable<Map<string, ChangeState>> {
    if (!diffChanges) {
        diffChanges = combineLatest([
            getLeftDiff().entries,
            getRightDiff().entries,
            hideUnchangedSizes
        ]).pipe(
            map(([leftEntries, rightEntries, skipUnchangedSize]) => {
                return getChangedEntries(leftEntries, rightEntries, skipUnchangedSize);
            })
        );
    }
    return diffChanges;
}

export type ChangeState = "added" | "deleted" | "modified";

async function getEntriesWithCRC(jar: MinecraftJar): Promise<Map<string, EntryInfo>> {
    const entries = new Map<string, EntryInfo>();

    for (const [path, file] of Object.entries(jar.jar.entries)) {
        if (!path.endsWith('.class')) {
            continue;
        }

        let className = path.substring(0, path.length - 6);
        if (path.includes('$')) {
            className = className.split('$')[0];
        }

        const existing = entries.get(className);
        if (existing) {
            insertSorted(existing.crcs, file.crc32);
            existing.totalUncompressedSize += file.uncompressedSize;
        } else {
            entries.set(className, {
                crcs: [file.crc32],
                totalUncompressedSize: file.uncompressedSize
            });
        }
    }

    return entries;
}

function getChangedEntries(
    leftEntries: Map<string, EntryInfo>,
    rightEntries: Map<string, EntryInfo>,
    skipUnchangedSize: boolean = false
): Map<string, ChangeState> {
    const changes = new Map<string, ChangeState>();

    const allKeys = new Set<string>([
        ...leftEntries.keys(),
        ...rightEntries.keys()
    ]);

    for (const key of allKeys) {
        const leftInfo = leftEntries.get(key);
        const rightInfo = rightEntries.get(key);

        if (leftInfo === undefined) {
            changes.set(key, "added");
        } else if (rightInfo === undefined) {
            changes.set(key, "deleted");
        } else if (!arraysEqual(leftInfo.crcs, rightInfo.crcs)) {
            if (skipUnchangedSize && leftInfo.totalUncompressedSize === rightInfo.totalUncompressedSize) {
                continue;
            }
            changes.set(key, "modified");
        }
    }

    return changes;
}

function insertSorted(arr: number[], num: number) {
    const idx = arr.findIndex(x => x > num);
    if (idx === -1) arr.push(num);
    else arr.splice(idx, 0, num);
    return arr;
}


function arraysEqual(a: number[], b: number[]) {
    return a.length === b.length && a.every((val, i) => val === b[i]);
}
