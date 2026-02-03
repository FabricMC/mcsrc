import { BehaviorSubject, combineLatest, from, map, Observable, switchMap, shareReplay } from "rxjs";
import { minecraftJar, minecraftJarPipeline, selectedMinecraftVersion, type MinecraftJar } from "./MinecraftApi";
import { currentResult, decompileResultPipeline, type DecompileResult } from "./Decompiler";
import { calculatedLineChanges } from "./LineChanges";

export const diffView = new BehaviorSubject<boolean>(false);
export const hideUnchangedSizes = new BehaviorSubject<boolean>(false);

export interface EntryInfo {
    classCrcs: Map<string, number>;
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

export interface DiffSummary {
    added: number;
    deleted: number;
    modified: number;
}

export interface ChangeInfo {
    state: ChangeState;
    additions?: number;
    deletions?: number;
}

// Clear calculated line changes when diff versions change to prevent stale data
setTimeout(() => {
    combineLatest([
        getLeftDiff().selectedVersion,
        selectedMinecraftVersion
    ]).subscribe(() => {
        calculatedLineChanges.next(new Map());
    });
}, 0);

let diffChanges: Observable<Map<string, ChangeInfo>> | null = null;
export function getDiffChanges(): Observable<Map<string, ChangeInfo>> {
    if (!diffChanges) {
        diffChanges = combineLatest([
            getLeftDiff().entries,
            getRightDiff().entries,
            hideUnchangedSizes,
            calculatedLineChanges
        ]).pipe(
            map(([leftEntries, rightEntries, skipUnchangedSize, lineChanges]) => {
                const changes = getChangedEntries(leftEntries, rightEntries, skipUnchangedSize);
                lineChanges.forEach((counts, file) => {
                    const info = changes.get(file);
                    if (info) {
                        info.additions = counts.additions;
                        info.deletions = counts.deletions;
                    }
                });
                return changes;
            }),
            shareReplay(1)
        );
    }
    return diffChanges;
}

let diffSummaryObs: Observable<DiffSummary> | null = null;
export function getDiffSummary(): Observable<DiffSummary> {
    if (!diffSummaryObs) {
        diffSummaryObs = getDiffChanges().pipe(
            map(changes => {
                const summary: DiffSummary = { added: 0, deleted: 0, modified: 0 };
                changes.forEach(info => {
                    summary[info.state]++;
                });
                return summary;
            }),
            shareReplay(1)
        );
    }
    return diffSummaryObs;
}

export type ChangeState = "added" | "deleted" | "modified";

async function getEntriesWithCRC(jar: MinecraftJar): Promise<Map<string, EntryInfo>> {
    const entries = new Map<string, EntryInfo>();

    for (const [path, file] of Object.entries(jar.jar.entries)) {
        if (!path.endsWith('.class')) {
            continue;
        }

        const className = path.substring(0, path.length - 6);
        const lastSlash = path.lastIndexOf('/');
        const folder = lastSlash !== -1 ? path.substring(0, lastSlash + 1) : '';
        const fileName = path.substring(folder.length);
        const baseFileName = fileName.includes('$') ? fileName.split('$')[0] : fileName.replace('.class', '');
        const baseClassName = folder + baseFileName + '.class';

        const existing = entries.get(baseClassName);
        if (existing) {
            existing.classCrcs.set(className, file.crc32);
            existing.totalUncompressedSize += file.uncompressedSize;
        } else {
            entries.set(baseClassName, {
                classCrcs: new Map([[className, file.crc32]]),
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
): Map<string, ChangeInfo> {
    const changes = new Map<string, ChangeInfo>();

    const allKeys = new Set<string>([
        ...leftEntries.keys(),
        ...rightEntries.keys()
    ]);

    for (const key of allKeys) {
        const leftInfo = leftEntries.get(key);
        const rightInfo = rightEntries.get(key);

        if (leftInfo === undefined) {
            changes.set(key, { state: "added" });
        } else if (rightInfo === undefined) {
            changes.set(key, { state: "deleted" });
        } else {
            const leftClasses = leftInfo.classCrcs;
            const rightClasses = rightInfo.classCrcs;

            // Check if any of the classes (including inner classes) have changed by comparing their CRCs.
            // A Map is used to track the CRC of each individual class file that belongs to this base class.
            const hasChanges = leftClasses.size !== rightClasses.size ||
                Array.from(leftClasses.entries()).some(([className, leftCrc]) => rightClasses.get(className) !== leftCrc);

            if (!hasChanges) {
                continue;
            }

            if (skipUnchangedSize && leftInfo.totalUncompressedSize === rightInfo.totalUncompressedSize) {
                continue;
            }

            changes.set(key, { state: "modified" });
        }
    }

    return changes;
}
