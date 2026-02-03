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

const MAX_CALCULATED_LINE_CHANGES = 500;

const calculatedLineChanges = new BehaviorSubject<Map<string, { additions: number, deletions: number; }>>(new Map());

export function updateLineChanges(file: string, additions: number, deletions: number) {
    const current = calculatedLineChanges.value;
    const existing = current.get(file);
    if (existing?.additions === additions && existing?.deletions === deletions) return;

    const next = new Map(current);
    if (next.size >= MAX_CALCULATED_LINE_CHANGES) {
        const firstKey = next.keys().next().value;
        if (firstKey) next.delete(firstKey);
    }
    next.set(file, { additions, deletions });
    calculatedLineChanges.next(next);
}

// Clear calculated line changes when diff versions change to prevent stale data
combineLatest([
    getLeftDiff().selectedVersion,
    selectedMinecraftVersion
]).subscribe(() => {
    calculatedLineChanges.next(new Map());
});

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
 * Uses an efficient O(N+M) hash-based counting approach.
 */
export function countLineDiff(oldText: string, newText: string): { additions: number, deletions: number; } {
    if (oldText === newText) return { additions: 0, deletions: 0 };

    // Ignore error messages or "not found" messages from decompiler when counting
    if (oldText.startsWith('// Class not found') || oldText.startsWith('// Error during decompilation')) {
        const newLines = newText === "" ? 0 : newText.split(/\r?\n/).length;
        return { additions: newLines, deletions: 0 };
    }
    if (newText.startsWith('// Class not found') || newText.startsWith('// Error during decompilation')) {
        const oldLines = oldText === "" ? 0 : oldText.split(/\r?\n/).length;
        return { additions: 0, deletions: oldLines };
    }

    const oldLines = oldText === "" ? [] : oldText.split(/\r?\n/);
    const newLines = newText === "" ? [] : newText.split(/\r?\n/);

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

    // Efficient O(N+M) diff using hash-based line counting
    const oldDiff = oldLines.slice(start, oldEnd + 1);
    const newDiff = newLines.slice(start, newEnd + 1);

    const lineCounts = new Map<string, number>();
    for (const line of oldDiff) {
        lineCounts.set(line, (lineCounts.get(line) || 0) + 1);
    }

    let commonInDiff = 0;
    for (const line of newDiff) {
        const count = lineCounts.get(line);
        if (count && count > 0) {
            lineCounts.set(line, count - 1);
            commonInDiff++;
        }
    }

    let deletionsInDiff = 0;
    for (const count of lineCounts.values()) {
        deletionsInDiff += count;
    }

    const totalCommon = start + (oldLines.length - 1 - oldEnd) + commonInDiff;

    return {
        deletions: deletionsInDiff,
        additions: newDiff.length - commonInDiff
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
