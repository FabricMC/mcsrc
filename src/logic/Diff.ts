import { BehaviorSubject, combineLatest, from, map, Observable, switchMap, shareReplay } from "rxjs";
import { minecraftJar, minecraftJarPipeline, selectedMinecraftVersion, type MinecraftJar } from "./MinecraftApi";
import { currentResult, decompileResultPipeline, type DecompileResult } from "./Decompiler";

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

const calculatedLineChanges = new BehaviorSubject<Map<string, { additions: number, deletions: number; }>>(new Map());

export function updateLineChanges(file: string, additions: number, deletions: number) {
    const current = calculatedLineChanges.value;
    const existing = current.get(file);
    if (existing?.additions === additions && existing?.deletions === deletions) return;

    const next = new Map(current);
    next.set(file, { additions, deletions });
    calculatedLineChanges.next(next);
}

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
/**
 * Simple line-based diff to count additions and deletions without external libraries.
 * Uses a basic Myers-ish approach or simplified LCS.
 */
export function countLineDiff(oldText: string, newText: string): { additions: number, deletions: number; } {
    if (oldText === newText) return { additions: 0, deletions: 0 };

    // Ignore error messages or "not found" messages from decompiler when counting
    if (oldText.startsWith('// Class not found') || oldText.startsWith('// Error during decompilation')) {
        const newLines = newText.split(/\r?\n/).length;
        return { additions: newLines, deletions: 0 };
    }
    if (newText.startsWith('// Class not found') || newText.startsWith('// Error during decompilation')) {
        const oldLines = oldText.split(/\r?\n/).length;
        return { additions: 0, deletions: oldLines };
    }

    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);

    let start = 0;
    while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) {
        start++;
    }

    let oldEnd = oldLines.length - 1;
    let newEnd = newLines.length - 1;
    while (oldEnd >= start && newEnd >= start && oldLines[oldEnd] === newLines[newEnd]) {
        oldEnd--;
        newEnd--;
    }

    const n = oldEnd - start + 1;
    const m = newEnd - start + 1;

    if (n <= 0) return { additions: Math.max(0, m), deletions: 0 };
    if (m <= 0) return { additions: 0, deletions: Math.max(0, n) };

    // Standard LCS DP with memory optimization (only O(min(N,M)) space)
    // We only need the length, not the full path.
    const shorts = n < m ? n : m;
    const longs = n < m ? m : n;
    const shortRows = n < m ? oldLines.slice(start, oldEnd + 1) : newLines.slice(start, newEnd + 1);
    const longRows = n < m ? newLines.slice(start, newEnd + 1) : oldLines.slice(start, oldEnd + 1);

    let prev = new Array(shorts + 1).fill(0);
    let curr = new Array(shorts + 1).fill(0);

    for (let i = 1; i <= longs; i++) {
        for (let j = 1; j <= shorts; j++) {
            if (longRows[i - 1] === shortRows[j - 1]) {
                curr[j] = prev[j - 1] + 1;
            } else {
                curr[j] = Math.max(prev[j], curr[j - 1]);
            }
        }
        [prev, curr] = [curr, prev];
    }

    const commonInRange = prev[shorts];
    const totalCommon = commonInRange + start + (oldLines.length - 1 - oldEnd);

    return {
        deletions: oldLines.length - totalCommon,
        additions: newLines.length - totalCommon
    };
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

            let hasChanges = false;

            for (const [className, leftCrc] of leftClasses) {
                const rightCrc = rightClasses.get(className);
                if (rightCrc === undefined || rightCrc !== leftCrc) {
                    hasChanges = true;
                    break;
                }
            }

            if (!hasChanges) {
                for (const className of rightClasses.keys()) {
                    if (!leftClasses.has(className)) {
                        hasChanges = true;
                        break;
                    }
                }
            }

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
