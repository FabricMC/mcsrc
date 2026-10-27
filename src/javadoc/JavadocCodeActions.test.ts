import { describe, expect, it, vi } from 'vitest';
import type { CancellationToken, editor, languages, Range } from 'monaco-editor';
import { registerJavadocCodeActions } from './JavadocCodeActions';

describe('Javadoc code actions', () => {
    it('offers versioned edits for the current diagnostic and ignores other editor models', async () => {
        const markdown = '@param second Second.\n@param first First.';
        const fullRange = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 20 };
        const uri = { toString: () => 'inmemory://javadoc' };
        const model = {
            getValue: () => markdown,
            getVersionId: () => 7,
            getFullModelRange: () => fullRange,
            isDisposed: () => false,
            uri,
        } as unknown as editor.ITextModel;
        const dispose = vi.fn();
        const registerCodeActionProvider = vi.fn((_language: string, _provider: languages.CodeActionProvider, _metadata: languages.CodeActionProviderMetadata) => ({ dispose }));
        const monaco = {
            languages: { registerCodeActionProvider },
            MarkerSeverity: { Error: 8, Warning: 4 },
        } as unknown as typeof import('monaco-editor');
        const registration = registerJavadocCodeActions(monaco, model, {
            typeParameters: [], parameters: ['first', 'second'], returnsValue: false,
        });
        const provider = registerCodeActionProvider.mock.calls[0][1];
        const range = { startLineNumber: 2, endLineNumber: 2, startColumn: 8, endColumn: 13 } as Range;
        const context = {} as languages.CodeActionContext;
        const cancellation = {} as CancellationToken;
        const result = await provider.provideCodeActions(model, range, context, cancellation);

        expect(result?.actions).toHaveLength(1);
        expect(result?.actions[0]).toMatchObject({
            title: 'Reorder @param tags to match the declaration',
            kind: 'quickfix',
            diagnostics: [expect.objectContaining({ code: 'parameter-order' })],
            edit: { edits: [{ resource: uri, versionId: 7, textEdit: {
                range: fullRange, text: '@param first First.\n@param second Second.',
            } }] },
        });
        const unrelated = await provider.provideCodeActions({} as editor.ITextModel, range, context, cancellation);
        expect(unrelated?.actions).toEqual([]);
        registration.dispose();
        expect(dispose).toHaveBeenCalledOnce();
    });
});
