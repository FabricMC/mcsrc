import { describe, expect, it, vi } from 'vitest';
import type { editor, Position } from 'monaco-editor';
import type { ParameterToken, Token } from '../../logic/Tokens';
import type { DecompileResult } from '../../workers/decompile/types';
import { toClassName, type ClassName } from '../../utils/Names';
import { getJavadocDeclaration, type DeclarationMetadata, type JavadocDeclaration } from './JavadocDeclaration';
import { JavadocTagCompletionProvider } from './JavadocTagCompletionProvider';

vi.mock('monaco-editor', () => ({
    languages: {
        CompletionItemKind: { Snippet: 27, Class: 5 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
}));

const emptyMetadata: DeclarationMetadata = { typeParameters: [], exceptions: [], recordComponents: [] };

const method: JavadocDeclaration = {
    type: 'method', parameters: ['count', 'value'], typeParameters: ['<T>'], exceptions: [], returnsValue: true,
};

function target(type: Token['type'] = 'method') {
    const token: Token = {
        type, start: 0, length: 7, className: toClassName('example/Owner'),
        declaration: true, name: 'convert', descriptor: '(II)Ljava/lang/Object;',
    } as Token;
    const result = { tokens: [token] } as DecompileResult;
    return { result, token };
}

function complete(markdown: string, declaration = method, jarClasses?: ReadonlySet<ClassName>) {
    const cursor = markdown.indexOf('|');
    const value = markdown.replace('|', '');
    const lines = value.split('\n');
    const beforeCursor = value.slice(0, cursor).split('\n');
    const position = { lineNumber: beforeCursor.length, column: beforeCursor.at(-1)!.length + 1 } as Position;
    const model = {
        getValue: () => value,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
    } as editor.ITextModel;
    return new JavadocTagCompletionProvider(declaration, model, jarClasses).provideCompletionItems(model, position).suggestions;
}

describe('Javadoc declaration metadata', () => {
    it('uses parameter metadata in declaration order and excludes other overloads and references', () => {
        const { result, token } = target();
        const first: ParameterToken = {
            type: 'parameter', className: token.className, declaration: true, start: 0, length: 5,
            methodName: 'convert', methodDescriptor: '(II)Ljava/lang/Object;', index: 0, name: 'first',
        };
        result.tokens.push(
            { ...first, index: 1, name: 'second' },
            { ...first, methodDescriptor: '(I)Ljava/lang/Object;', name: 'otherOverload' },
            { ...first, className: toClassName('example/Other'), name: 'otherClass' },
            { ...first, methodName: '<init>', name: 'constructorParameter' },
            { ...first, declaration: false, name: 'reference' },
            { ...first, name: 'this' },
            first,
        );
        expect(getJavadocDeclaration(result, token, emptyMetadata).parameters).toEqual(['first', 'second']);
    });

    it('uses class generics and record components from bytecode metadata', () => {
        const record = target('class');
        const metadata = { ...emptyMetadata, typeParameters: ['T'], recordComponents: ['value', 'count'] };
        expect(getJavadocDeclaration(record.result, record.token, metadata)).toEqual({
            type: 'class', exceptions: [],
            parameters: ['value', 'count'], typeParameters: ['<T>'], returnsValue: false,
        });
    });
});

describe('Javadoc tag completion', () => {
    it('excludes documented type parameters and parameters, including tags after the cursor', () => {
        const suggestions = complete('@param <T> documented\n@param |\n@param value documented');
        expect(suggestions.map(item => item.label)).toEqual(['count']);
        expect(suggestions[0].insertText).toBe('count ${1:description}$0');
    });

    it('offers individual parameter completions without a bulk snippet', () => {
        const suggestions = complete('@param count documented\n@pa|');
        const parameters = suggestions.filter(item => String(item.label).startsWith('@param'));
        expect(parameters.map(item => item.label)).toEqual(['@param <T>', '@param value']);
        expect(parameters.every(item => !item.insertText.includes('\n'))).toBe(true);
    });

    it('omits @return when the declaration has no return value', () => {
        expect(complete('@|', { ...method, returnsValue: false }).map(item => item.label)).not.toContain('@return');
    });

    it('offers @return for value-returning methods and avoids duplicate singleton tags', () => {
        expect(complete('@|').map(item => item.label)).toContain('@return');
        expect(complete('@return documented\n@|').map(item => item.label)).not.toContain('@return');
    });

    it.each([' existing description', '\nA multiline description.'])('preserves parameter descriptions: %s', description => {
        const suggestion = complete(`@param va|lue${description}`).find(item => item.label === 'value');
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

    it.each(['```java\n@throws |\n```', '    @param |', 'Contact user@|', '`@|`'])('leaves prose and code alone: %s', markdown => {
        expect(complete(markdown)).toEqual([]);
    });
});

describe('Declared exception completion', () => {
    const declaration = { ...method, exceptions: ['java.io.IOException', 'E'] };

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
        const shortName = { ...method, exceptions: ['IOException'] };
        expect(complete('@throws java.io.IOException documented\n@throws |', shortName)).toEqual([]);
    });

    it.each([' existing description', '\nA multiline description.'])('preserves exception descriptions: %s', description => {
        const suggestion = complete(`@throws java.io.IO|Exception${description}`, declaration)[0];
        expect(suggestion.insertText).toBe('java.io.IOException$0');
        expect(suggestion.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 19 },
            replace: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 28 },
        });
    });
});

describe('JAR class completion in exception tags', () => {
    const jarClasses = new Set([
        toClassName('example/Example$Inner'),
        toClassName('other/Example$Inner'),
        toClassName('example/Example$1'),
        toClassName('example/Example$1Local'),
    ]);

    it.each(['throws', 'exception'])('offers qualified classes for @%s', tag => {
        const suggestions = complete(`@${tag} Inn|`, method, jarClasses);
        const classes = suggestions.filter(item => item.kind === 5);
        expect(classes.map(item => item.label)).toEqual([
            { label: 'Example.Inner', description: 'example.Example.Inner' },
            { label: 'Example.Inner', description: 'other.Example.Inner' },
        ]);
        expect(classes.map(item => item.insertText)).toEqual([
            'example.Example.Inner ${1:description}$0',
            'other.Example.Inner ${1:description}$0',
        ]);
        expect(classes[0].filterText).toBe('Inner');
    });

    it('replaces qualified names and preserves descriptions', () => {
        const suggestions = complete('@throws example.Example.Inn|er explanation', method, jarClasses);
        const inner = suggestions.find(item => item.detail === 'example.Example.Inner');
        expect(inner?.insertText).toBe('example.Example.Inner$0');
        expect(inner?.filterText).toBe('example.Example.Inner');
        expect(inner?.range).toEqual({
            insert: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 28 },
            replace: { startLineNumber: 1, startColumn: 9, endLineNumber: 1, endColumn: 30 },
        });
    });

    it('uses implicit java.lang names from attached libraries', () => {
        const classes = new Set([toClassName('java/lang/RuntimeException')]);
        const suggestions = complete('@throws Run|', method, classes);
        const exception = suggestions.find(item => item.detail === 'java.lang.RuntimeException');
        expect(exception?.insertText).toBe('RuntimeException ${1:description}$0');
        expect(exception?.filterText).toBe('RuntimeException');
    });

    it('shortens declared java.lang exceptions in tag and name completion', () => {
        const declaration = { ...method, exceptions: ['java.lang.RuntimeException'] };
        expect(complete('@throws Run|', declaration)[0].insertText).toBe('RuntimeException ${1:description}$0');
        expect(complete('@thr|', declaration).find(item => item.label === '@throws RuntimeException')?.insertText)
            .toBe('@throws RuntimeException ${1:description}$0');
    });
});
