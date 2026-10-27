import { describe, expect, it, vi } from 'vitest';
import type { editor, Position } from 'monaco-editor';
import type { ParameterToken, Token } from '../logic/Tokens';
import type { DecompileResult } from '../workers/decompile/types';
import { toClassName } from '../utils/Names';
import { getDeclaredExceptions, getJavadocDeclaration } from './JavadocDeclaration';
import { JavadocTagCompletionProvider } from './JavadocTagCompletionProvider';

vi.mock('monaco-editor', () => ({
    languages: {
        CompletionItemKind: { Snippet: 27 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
}));

function target(source: string, type: Token['type'] = 'method', descriptor = '()Ljava/lang/Object;', name = 'convert') {
    const start = source.indexOf('|');
    const token: Token = {
        type,
        start,
        length: source.slice(start + 1).match(/^[\w$]+/)![0].length,
        className: toClassName('example/Owner'),
        declaration: true,
        name,
        descriptor,
    } as Token;
    const result = { source: source.replace('|', ''), tokens: [token] } as unknown as DecompileResult;
    return { result, token };
}

function complete(markdown: string, declaration = target('public <T> T |convert(int count, T value) {}')) {
    const cursor = markdown.indexOf('|');
    const value = markdown.replace('|', '');
    const lines = value.split('\n');
    const beforeCursor = value.slice(0, cursor).split('\n');
    const position = { lineNumber: beforeCursor.length, column: beforeCursor.at(-1)!.length + 1 } as Position;
    const model = {
        getValue: () => value,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
        getOffsetAt: (position: Position) => lines.slice(0, position.lineNumber - 1).reduce((offset, line) => offset + line.length + 1, 0) + position.column - 1,
    } as editor.ITextModel;
    return new JavadocTagCompletionProvider(declaration.result, declaration.token, model).provideCompletionItems(model, position).suggestions;
}

describe('Javadoc declaration metadata', () => {
    it('uses parameter metadata in declaration order and excludes other overloads and references', () => {
        const { result, token } = target('public Object |convert(int sourceFirst, int sourceSecond) {}', 'method', '(II)Ljava/lang/Object;');
        const first: ParameterToken = {
            type: 'parameter', className: token.className, declaration: true, start: 0, length: 5,
            methodName: 'convert', methodDescriptor: '(II)Ljava/lang/Object;', index: 0, name: 'first',
        };
        result.tokens.push(
            { ...first, index: 1, name: 'second' },
            { ...first, methodDescriptor: '(I)Ljava/lang/Object;', name: 'otherOverload' },
            { ...first, declaration: false, name: 'reference' },
            first,
        );
        expect(getJavadocDeclaration(result, token).parameters).toEqual(['first', 'second']);
    });

    it('handles nested generic bounds, annotations, arrays, and varargs', () => {
        const { result, token } = target(`class Owner {
            @Annotation(nested = @Nested(values = {"(", ")"}))
            public <T extends Comparable<T>, U> T |convert(
                @Annotation(values = {"a,b"}) Map<String, List<U>> values,
                int counts[], T... others
            ) { return null; }
        }`);
        expect(getJavadocDeclaration(result, token)).toEqual({
            parameters: ['values', 'counts', 'others'],
            typeParameters: ['<T>', '<U>'],
            returnsValue: true,
        });
    });

    it('reads class generics and record components without leaking enclosing type parameters', () => {
        const record = target('public record |Owner<T>(T value, int count) {}', 'class');
        expect(getJavadocDeclaration(record.result, record.token)).toEqual({
            parameters: ['value', 'count'], typeParameters: ['<T>'], returnsValue: false,
        });
        const method = target('class Owner<T> { public T |convert(T value) {} }');
        expect(getJavadocDeclaration(method.result, method.token).typeParameters).toEqual([]);
    });
});

describe('Javadoc tag completion', () => {
    it('suggests undocumented value and type parameters after @param', () => {
        const suggestions = complete('@param count documented\n@param |');
        expect(suggestions.map(item => item.label)).toEqual(['<T>', 'value']);
        expect(suggestions[0].insertText).toBe('<T> ${1:description}$0');
    });

    it('excludes documented type parameters and parameters, including tags after the cursor', () => {
        const suggestions = complete('@param <T> documented\n@param |\n@param value documented');
        expect(suggestions.map(item => item.label)).toEqual(['count']);
    });

    it('offers individual parameter completions without a bulk snippet', () => {
        const suggestions = complete('@param count documented\n@pa|');
        const parameters = suggestions.filter(item => String(item.label).startsWith('@param'));
        expect(parameters.map(item => item.label)).toEqual(['@param <T>', '@param value']);
        expect(parameters.every(item => !item.insertText.includes('\n'))).toBe(true);
    });

    it.each([
        target('public void |convert(int count) {}', 'method', '(I)V'),
        target('public |Owner(int count) {}', 'method', '(I)V', '<init>'),
        target('public class |Owner<T> {}', 'class'),
        target('public int |count;', 'field', 'I'),
    ])('omits @return for declarations without a return value', declaration => {
        expect(complete('@|', declaration).map(item => item.label)).not.toContain('@return');
    });

    it('offers @return for value-returning methods and avoids duplicate singleton tags', () => {
        expect(complete('@|').map(item => item.label)).toContain('@return');
        expect(complete('@return documented\n@|').map(item => item.label)).not.toContain('@return');
    });

    it('preserves an existing parameter description while replacing its name', () => {
        const suggestion = complete('@param va|lue existing description').find(item => item.label === 'value');
        expect(suggestion?.insertText).toBe('value$0');
        expect(suggestion?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 10 },
            replace: { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 13 },
        });
    });

    it('ignores example tags when deciding which parameters are documented', () => {
        const suggestions = complete('```java\n@param count example\n```\n@param |');
        expect(suggestions.map(item => item.label)).toContain('count');
    });

    it.each(['```java\n@|\n```', '    @|', 'Contact user@|', '`@|`'])('leaves prose and code alone: %s', markdown => {
        expect(complete(markdown)).toEqual([]);
    });
});


describe('Declared exception completion', () => {
    const declaration = target(`public <E extends Exception> void |convert(
        @Annotation(values = {"(", ")"}) int count
    ) throws @TypeAnnotation java.io.IOException,
        E;`);

    it('reads multiline, qualified, annotated, and generic exception types', () => {
        expect(getDeclaredExceptions(declaration.result, declaration.token)).toEqual(['java.io.IOException', 'E']);
    });

    it('reads constructor exceptions and legacy array return syntax', () => {
        const constructor = target('public |Owner() throws IOException {}', 'method', '()V', '<init>');
        expect(getDeclaredExceptions(constructor.result, constructor.token)).toEqual(['IOException']);
        const method = target('public String |convert() [] throws IOException {}');
        expect(getDeclaredExceptions(method.result, method.token)).toEqual(['IOException']);
    });

    it('does not read exceptions from method bodies or subsequent declarations', () => {
        const method = target('void |convert() { throw new IOException(); } void other() throws OtherException {}');
        expect(getDeclaredExceptions(method.result, method.token)).toEqual([]);
    });

    it('offers declared exceptions after @throws and @exception', () => {
        for (const tag of ['throws', 'exception']) {
            const suggestions = complete(`@${tag} |`, declaration);
            expect(suggestions.map(item => item.label)).toEqual(['java.io.IOException', 'E']);
            expect(suggestions[0].insertText).toBe('java.io.IOException ${1:description}$0');
        }
    });

    it('offers complete throws snippets when completing a block tag', () => {
        const suggestions = complete('@thr|', declaration);
        expect(suggestions.find(item => item.label === '@throws java.io.IOException')?.insertText)
            .toBe('@throws java.io.IOException ${1:description}$0');
        expect(suggestions.map(item => item.label)).toContain('@throws');
    });

    it('excludes documented exceptions using either tag and short or qualified names', () => {
        expect(complete('@throws IOException documented\n@exception E documented\n@throws |', declaration)).toEqual([]);
        const shortName = target('void |convert() throws IOException {}');
        expect(complete('@throws java.io.IOException documented\n@throws |', shortName)).toEqual([]);
    });

    it('preserves an existing description and replaces a qualified exception suffix', () => {
        const suggestion = complete('@throws java.io.IO|Exception existing description', declaration)[0];
        expect(suggestion.insertText).toBe('java.io.IOException$0');
        expect(suggestion.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 19 },
            replace: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 28 },
        });
    });

    it('ignores documented exceptions inside examples and the line being edited', () => {
        const suggestions = complete('```java\n@throws java.io.IOException example\n```\n@throws java.io.IO|Exception description', declaration);
        expect(suggestions.map(item => item.label)).toContain('java.io.IOException');
    });

    it('does not offer exceptions inside code, prose, parameter tags, or exception descriptions', () => {
        for (const markdown of ['```java\n@throws |\n```', '    @throws |', 'Example @throws |', '@param |', '@throws IOException description |']) {
            expect(complete(markdown, declaration).map(item => item.label)).not.toContain('java.io.IOException');
        }
    });

    it('keeps generic throws snippets available for undeclared exceptions', () => {
        expect(complete('@|').map(item => item.label)).toContain('@throws');
        expect(complete('@throws |')).toEqual([]);
    });
});
