import { describe, expect, it, vi } from 'vitest';
import { languages, type CancellationToken, type editor, type Position } from 'monaco-editor';
import { JavadocCompletionProvider } from './JavadocCompletionProvider';
import { getJavadocReference } from './JavadocReference';
import { toClassName } from '../utils/Names';
import type { DecompileResult } from '../workers/decompile/types';
import type { JarIndex } from '../workers/jar-index/client';
import type { MemberData, Method, Field } from '../workers/jar-index/types';

vi.mock('monaco-editor', () => ({
    languages: {
        CompletionItemKind: { Class: 5, Method: 1, Field: 3 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
}));
vi.mock('./Javadoc', () => ({ getJavadocForToken: () => 'Stored documentation' }));

function documentAtCursor(markdown: string) {
    const offset = markdown.indexOf('|');
    const value = markdown.replace('|', '');
    const lines = value.split('\n');
    const beforeCursor = value.slice(0, offset).split('\n');
    const position = { lineNumber: beforeCursor.length, column: beforeCursor.at(-1)!.length + 1 } as Position;
    const model = {
        getValue: () => value,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
        getOffsetAt: (position: Position) => lines.slice(0, position.lineNumber - 1).reduce((offset, line) => offset + line.length + 1, 0) + position.column - 1,
        getVersionId: () => 1,
        isDisposed: () => false,
    } as editor.ITextModel;
    return { model, position };
}

function memberData(owner: string, methods: string[] = [], fields: string[] = []): MemberData {
    return {
        className: toClassName(owner),
        methods: methods.map(method => `${owner}:${method}` as Method),
        fields: fields.map(field => `${owner}:${field}` as Field),
        methodAccess: Object.fromEntries(methods.map(method => [`${owner}:${method}`, 1])),
        methodBridges: {},
    };
}

async function complete(markdown: string, owner = 'example/Owner') {
    const { model, position } = documentAtCursor(markdown);
    const members = [
        memberData('example/Owner', ['run:(I)V', 'run:([Ljava/lang/String;)V']),
        memberData('example/Parent', ['inherited:()I'], ['VALUE:I']),
        memberData('example/Owner$Nested', ['nestedOnly:()V']),
        memberData('other/Remote', ['remote:()V']),
        memberData('example/Remote', ['localRemote:()V']),
        memberData('unimported/Unimported'),
    ];
    const index = {
        getClassData: async () => members.map(data => ({
            className: data.className,
            superName: data.className === 'example/Owner' ? toClassName('example/Parent') : '',
            interfaces: [],
            accessFlags: 1,
        })),
        getMemberData: async () => members,
    } as unknown as JarIndex;
    const result = { source: 'import other.Remote;', tokens: [] } as unknown as DecompileResult;
    const provider = new JavadocCompletionProvider(result, toClassName(owner), index, model);
    const completions = await provider.provideCompletionItems(model, position, {} as languages.CompletionContext, { isCancellationRequested: false } as CancellationToken);
    return { provider, suggestions: completions.suggestions };
}

describe('Javadoc reference context', () => {
    it.each([
        '[BlockSt|ate]',
        '[BlockSt|',
        '[the state][BlockSt|ate]',
        '[#run(java.lang.String\\[\\]|)]',
        '```java\n[Ignored]\n```\n[Block|]',
        '`literal` [Block|]',
        '@see |',
        '@see Rem|ote',
        '@see other.Remote#rem|ote()',
        '@see #run(java.lang.String[]|)',
        '@see #run(int, |java.lang.String)',
        '@see [Rem|ote]',
    ])('recognises reference %s', markdown => {
        const { model, position } = documentAtCursor(markdown);
        expect(getJavadocReference(model, position)).not.toBeNull();
    });

    it.each([
        '`[Block|]`',
        '`` [Block|] ``',
        '```java\n[Block|]\n```',
        '~~~java\n[Block|]\n~~~',
        '\\[Block|]',
        '[label|](https://example.com)',
        '[label|][Block]',
        '[Block|]: https://example.com',
        '![image|]',
        '[Finished] prose| ]',
        '@see Remote custom lab|el',
        '@see "quoted tex|t"',
        '@see |"quoted text"',
        '@see <a href="https://example.com">lab|el</a>',
        '@see |<a href="https://example.com">label</a>',
        '@see |[Remote]',
        '    @see Rem|ote',
        'Prose @see Rem|ote',
        '```java\n@see Rem|ote\n```',
        '~~~java\n@see Rem|ote\n~~~',
    ])('ignores Markdown context %s', markdown => {
        const { model, position } = documentAtCursor(markdown);
        expect(getJavadocReference(model, position)).toBeNull();
    });
});

describe('@see reference completion', () => {
    it('completes classes without adding Markdown brackets', async () => {
        const { suggestions } = await complete('@see |');
        expect(suggestions.find(item => item.detail === 'other.Remote')?.insertText).toBe('Remote$0');
        expect(suggestions.find(item => item.detail === 'unimported.Unimported')?.insertText).toBe('unimported.Unimported$0');
    });

    it('completes imported and qualified member owners', async () => {
        for (const owner of ['Remote', 'other.Remote']) {
            const { suggestions } = await complete(`@see ${owner}#|`);
            expect(suggestions.map(item => item.insertText)).toEqual([`${owner}#remote()$0`]);
        }
    });

    it('offers overloads, inherited methods, and fields with unescaped array types', async () => {
        const { suggestions } = await complete('@see #|');
        expect(suggestions.map(item => item.insertText)).toEqual(expect.arrayContaining([
            '#run(int)$0', '#run(java.lang.String[])$0', '#inherited()$0', '#VALUE$0',
        ]));
    });

    it('replaces only the reference, preserving its custom label', async () => {
        const { suggestions } = await complete('@see #ru|n(int) custom label');
        const suggestion = suggestions.find(item => item.insertText === '#run(int)$0');
        expect(suggestion?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 9 },
            replace: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 15 },
        });
    });

    it('preserves the member suffix when completing a class name', async () => {
        const { suggestions } = await complete('@see Rem|ote#remote() custom label');
        const suggestion = suggestions.find(item => item.detail === 'other.Remote');
        expect(suggestion?.insertText).toBe('Remote$0');
        expect(suggestion?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 9 },
            replace: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 12 },
        });
    });

    it('replaces a full method signature including spaces between arguments', async () => {
        const { suggestions } = await complete('@see #run(int, |String[]) label');
        const suggestion = suggestions.find(item => item.insertText === '#run(int)$0');
        expect(suggestion?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 16 },
            replace: { startLineNumber: 1, startColumn: 6, endLineNumber: 1, endColumn: 25 },
        });
    });
});

describe('Javadoc completion', () => {
    it('replaces a complete reference and distinguishes overloads with escaped arrays', async () => {
        const { suggestions } = await complete('[#ru|n]');
        const overloads = suggestions.filter(item => typeof item.label !== 'string' && item.label.label.startsWith('run('));
        expect(overloads).toHaveLength(2);
        expect(overloads.map(item => item.insertText)).toEqual(['#run(int)$0', '#run(java.lang.String\\\\[\\\\])$0']);
        expect(overloads[0].range).toEqual({
            insert: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 5 },
            replace: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 6 },
        });
    });

    it('includes inherited members without leaking nested-class declarations', async () => {
        const { suggestions, provider } = await complete('[#|]');
        expect(suggestions.map(item => item.insertText)).toContain('#inherited()$0');
        expect(suggestions.map(item => item.insertText)).toContain('#VALUE$0');
        expect(suggestions.map(item => item.insertText)).not.toContain('#nestedOnly()$0');
        expect(provider.resolveCompletionItem(suggestions[0]).documentation).toEqual({ value: 'Stored documentation', isTrusted: false });
    });

    it('resolves imported and fully qualified member owners from the index', async () => {
        for (const reference of ['Remote', 'other.Remote']) {
            const { suggestions } = await complete(`[${reference}#|]`);
            expect(suggestions.map(item => item.insertText)).toEqual([`${reference}#remote()$0`]);
        }
    });

    it('completes classes outside imports with qualified references and closes unfinished links', async () => {
        const { suggestions } = await complete('[|', 'example/Owner$Nested');
        const remote = suggestions.find(item => item.detail === 'other.Remote');
        const parent = suggestions.find(item => item.detail === 'example.Parent');
        expect(remote?.insertText).toBe('Remote$0]');
        expect(parent?.insertText).toBe('Parent$0]');
        expect(suggestions.find(item => item.detail === 'example.Remote')?.insertText).toBe('example.Remote$0]');
        expect(suggestions.find(item => item.detail === 'unimported.Unimported')?.insertText).toBe('unimported.Unimported$0]');
        expect(suggestions.find(item => item.detail === 'java.lang.String')?.insertText).toBe('String$0]');
    });

    it('preserves an existing member when completing its class name', async () => {
        const { suggestions } = await complete('[Rem|ote#remote()]');
        const remote = suggestions.find(item => item.detail === 'other.Remote');
        expect(remote?.insertText).toBe('Remote$0');
        expect(remote?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 5 },
            replace: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 8 },
        });
    });
});
