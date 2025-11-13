import { BehaviorSubject, combineLatest, from, map, Observable, switchMap } from "rxjs";
import { minecraftJar, minecraftJarPipeline, selectedMinecraftVersion, type MinecraftJar } from "./MinecraftApi";
import { currentResult, decompileResultPipeline, type DecompileResult } from "./Decompiler";

export const diffView = new BehaviorSubject<boolean>(false);

export interface DiffSide {
    selectedVersion: BehaviorSubject<string | null>;
    jar: Observable<MinecraftJar>;
    entries: Observable<Map<string, number[]>>;
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
            getRightDiff().entries
        ]).pipe(
            map(([leftEntries, rightEntries]) => {
                return getChangedEntries(leftEntries, rightEntries);
            })
        );
    }
    return diffChanges;
}

export type ChangeState = "added" | "deleted" | "modified";

async function getEntriesWithCRC(jar: MinecraftJar): Promise<Map<string, number[]>> {
    const entries = new Map<string, number[]>();

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
            insertSorted(existing, file.crc32);
        } else {
            entries.set(className, [file.crc32]);
        }
    }

    return entries;
}

function getChangedEntries(
    leftEntries: Map<string, number[]>,
    rightEntries: Map<string, number[]>
): Map<string, ChangeState> {
    const changes = new Map<string, ChangeState>();

    const allKeys = new Set<string>([
        ...leftEntries.keys(),
        ...rightEntries.keys()
    ]);

    for (const key of allKeys) {
        const leftCRC = leftEntries.get(key);
        const rightCRC = rightEntries.get(key);

        if (leftCRC === undefined) {
            changes.set(key, "added");
        } else if (rightCRC === undefined) {
            changes.set(key, "deleted");
        } else if (!arraysEqual(leftCRC, rightCRC)) {
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