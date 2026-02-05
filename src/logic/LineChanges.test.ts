import { describe, it, expect, beforeEach } from 'vitest';
import { countLineDiff, updateLineChanges, calculatedLineChanges } from './LineChanges';

describe('LineChanges', () => {
    describe('countLineDiff', () => {
        it('should return 0 additions and deletions for identical strings', () => {
            const text = 'line 1\nline 2';
            expect(countLineDiff(text, text)).toEqual({ additions: 0, deletions: 0 });
        });

        it('should count a single addition', () => {
            const oldText = 'line 1';
            const newText = 'line 1\nline 2';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 1, deletions: 0 });
        });

        it('should count a single deletion', () => {
            const oldText = 'line 1\nline 2';
            const newText = 'line 1';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 0, deletions: 1 });
        });

        it('should count modifications as one deletion and one addition', () => {
            const oldText = 'line 1\nold line';
            const newText = 'line 1\nnew line';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 1, deletions: 1 });
        });

        it('should handle completely different strings', () => {
            const oldText = 'a\nb\nc';
            const newText = 'd\ne';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 2, deletions: 3 });
        });

        it('should handle special error prefixes for old text', () => {
            const oldText = '// Class not found';
            const newText = 'public class Test {}';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 1, deletions: 0 });
        });

        it('should handle special error prefixes for new text', () => {
            const oldText = 'public class Test {}';
            const newText = '// Error during decompilation';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 0, deletions: 1 });
        });

        it('should handle empty strings', () => {
            expect(countLineDiff('', 'line 1')).toEqual({ additions: 1, deletions: 0 });
            expect(countLineDiff('line 1', '')).toEqual({ additions: 0, deletions: 1 });
            expect(countLineDiff('', '')).toEqual({ additions: 0, deletions: 0 });
        });

        it('should ignore common prefix and suffix', () => {
            const oldText = 'start\nmiddle-old\nend';
            const newText = 'start\nmiddle-new\nend';
            expect(countLineDiff(oldText, newText)).toEqual({ additions: 1, deletions: 1 });
        });
    });

    describe('updateLineChanges', () => {
        beforeEach(() => {
            calculatedLineChanges.next(new Map());
        });

        it('should update the BehaviorSubject with new changes', () => {
            updateLineChanges('file.java', 'line 1', 'line 1\nline 2');
            const result = calculatedLineChanges.value.get('file.java');
            expect(result).toEqual({ additions: 1, deletions: 0 });
        });

        it('should not update the BehaviorSubject if changes are identical', () => {
            const initialMap = new Map([['file.java', { additions: 1, deletions: 0 }]]);
            calculatedLineChanges.next(initialMap);

            updateLineChanges('file.java', 'line 1', 'line 1\nline 2');

            expect(calculatedLineChanges.value).toBe(initialMap); // Reference should stay same
        });

        it('should add multiple files to the map', () => {
            updateLineChanges('file1.java', 'a', 'a\nb');
            updateLineChanges('file2.java', 'x', 'y');

            expect(calculatedLineChanges.value.get('file1.java')).toEqual({ additions: 1, deletions: 0 });
            expect(calculatedLineChanges.value.get('file2.java')).toEqual({ additions: 1, deletions: 1 });
        });

        it('should evict old entries when reaching MAX_CALCULATED_LINE_CHANGES', () => {
            // Fill up to 500
            for (let i = 0; i < 500; i++) {
                updateLineChanges(`file${i}.java`, '', 'line');
            }
            expect(calculatedLineChanges.value.size).toBe(500);
            expect(calculatedLineChanges.value.has('file0.java')).toBe(true);

            // Add 501st entry
            updateLineChanges('file501.java', '', 'line');

            expect(calculatedLineChanges.value.size).toBe(500);
            expect(calculatedLineChanges.value.has('file0.java')).toBe(false); // First one should be evicted
            expect(calculatedLineChanges.value.has('file501.java')).toBe(true);
        });
    });
});
