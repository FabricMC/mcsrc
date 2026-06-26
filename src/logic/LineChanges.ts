import { BehaviorSubject } from "rxjs";
import type { JarEntryPath } from "../utils/Names";

const MAX_CALCULATED_LINE_CHANGES = 500;
const MAX_EXACT_DIFF_STEPS = 1_000_000;

export const calculatedLineChanges = new BehaviorSubject<Map<JarEntryPath, { additions: number, deletions: number; }>>(new Map());

/**
 * Simple line-based diff to count additions and deletions without external libraries.
 * Counts ordered insertions and deletions so moved lines do not disappear from the result.
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

    const editDistance = countOrderedLineEditDistance(
        oldLines.slice(start, oldEnd + 1),
        newLines.slice(start, newEnd + 1)
    );

    if (editDistance === null) {
        return { additions: m, deletions: n };
    }

    return {
        additions: (editDistance + m - n) / 2,
        deletions: (editDistance - m + n) / 2
    };
}

function countOrderedLineEditDistance(oldLines: string[], newLines: string[]): number | null {
    const n = oldLines.length;
    const m = newLines.length;
    const max = n + m;
    const offset = max + 1;
    const furthestX = new Int32Array(2 * max + 3);
    let steps = 0;

    for (let d = 0; d <= max; d++) {
        for (let k = -d; k <= d; k += 2) {
            if (++steps > MAX_EXACT_DIFF_STEPS) return null;

            const index = offset + k;
            const insertLine = k === -d || (k !== d && furthestX[index - 1] < furthestX[index + 1]);
            let x = insertLine ? furthestX[index + 1] : furthestX[index - 1] + 1;
            let y = x - k;

            while (x < n && y < m && oldLines[x] === newLines[y]) {
                x++;
                y++;
            }

            furthestX[index] = x;
            if (x >= n && y >= m) return d;
        }
    }

    return null;
}

export function updateLineChanges(file: JarEntryPath, leftSource: string, rightSource: string) {
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
