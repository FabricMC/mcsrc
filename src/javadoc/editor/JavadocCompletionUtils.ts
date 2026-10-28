import type { IPosition, IRange } from 'monaco-editor';

export interface CompletionRange {
    insert: IRange;
    replace: IRange;
}

export function getCompletionRange(position: IPosition, startColumn: number, endColumn: number): CompletionRange {
    const start = { startLineNumber: position.lineNumber, startColumn, endLineNumber: position.lineNumber };
    return {
        insert: { ...start, endColumn: position.column },
        replace: { ...start, endColumn },
    };
}

export function escapeSnippet(text: string): string {
    return text.replace(/[\\$}]/g, '\\$&');
}
