import { afterEach, describe, expect, it, vi } from 'vitest';
import type { editor } from 'monaco-editor';
import { applyJavadocValidation } from './JavadocValidationMarkers';

afterEach(() => vi.useRealTimers());

describe('Javadoc validation markers', () => {
    it('publishes errors and warnings, refreshes after edits, and clears its markers on cleanup', () => {
        vi.useFakeTimers();
        let value = '@param typo';
        let contentChanged = () => {};
        const disposeListener = vi.fn();
        const model = {
            getValue: () => value,
            isDisposed: () => false,
            onDidChangeContent: (listener: () => void) => {
                contentChanged = listener;
                return { dispose: disposeListener };
            },
        } as unknown as editor.ITextModel;
        const setModelMarkers = vi.fn();
        const monaco = {
            MarkerSeverity: { Error: 8, Warning: 4 },
            editor: { setModelMarkers },
        } as unknown as typeof import('monaco-editor');

        const validation = applyJavadocValidation(monaco, model, {
            typeParameters: [], parameters: ['count'], returnsValue: false,
        });
        const initialMarkers = setModelMarkers.mock.calls[0][2];
        expect(initialMarkers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'unknown-parameter', severity: 8 }),
            expect.objectContaining({ code: 'missing-description', severity: 4 }),
        ]));

        value = '@param count description';
        contentChanged();
        vi.advanceTimersByTime(200);
        expect(setModelMarkers).toHaveBeenCalledTimes(1);
        contentChanged();
        vi.advanceTimersByTime(300);
        expect(setModelMarkers).toHaveBeenLastCalledWith(model, 'javadoc-validation', []);

        contentChanged();
        validation.dispose();
        expect(disposeListener).toHaveBeenCalledOnce();
        expect(setModelMarkers).toHaveBeenLastCalledWith(model, 'javadoc-validation', []);
        const callsAfterCleanup = setModelMarkers.mock.calls.length;
        vi.runAllTimers();
        expect(setModelMarkers).toHaveBeenCalledTimes(callsAfterCleanup);
    });
});
