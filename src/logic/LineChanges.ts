import { BehaviorSubject } from "rxjs";

const MAX_CALCULATED_LINE_CHANGES = 500;

export const calculatedLineChanges = new BehaviorSubject<Map<string, { additions: number, deletions: number; }>>(new Map());

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

    return {
        deletions: deletionsInDiff,
        additions: newDiff.length - commonInDiff
    };
}

export function updateLineChanges(file: string, leftSource: string, rightSource: string) {
    const { additions, deletions } = countLineDiff(leftSource, rightSource);

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
