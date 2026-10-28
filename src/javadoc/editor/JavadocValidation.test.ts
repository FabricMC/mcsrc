import { describe, expect, it } from 'vitest';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { validateJavadoc } from './JavadocValidation';

const declaration: JavadocDeclaration = {
    type: 'method', exceptions: [], typeParameters: ['<T>'], parameters: ['count', 'value'], returnsValue: true,
};

describe('Javadoc parameter validation', () => {
    it('underlines unknown and duplicate names in red at their exact positions', () => {
        const diagnostics = validateJavadoc('  @param typo description\n@param count first\n@param count second', declaration);
        expect(diagnostics.filter(diagnostic => diagnostic.severity === 'error')).toEqual([
            { severity: 'error', code: 'unknown-parameter', message: "Unknown parameter 'typo'.", startLineNumber: 1, endLineNumber: 1, startColumn: 10, endColumn: 14 },
            { severity: 'error', code: 'duplicate-parameter', message: "Parameter 'count' is already documented.", startLineNumber: 3, endLineNumber: 3, startColumn: 8, endColumn: 13 },
        ]);
    });

    it('warns for empty descriptions but accepts multiline descriptions and code examples', () => {
        const diagnostics = validateJavadoc('@param <T>\n  \n@param count\nA multiline description.\n\n@param value\n```java\nvalue();\n```', declaration);
        expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual(['missing-description']);
        expect(diagnostics[0].severity).toBe('warning');
        expect(diagnostics[0].startLineNumber).toBe(1);
    });

    it('allows undocumented parameters and type parameters', () => {
        for (const markdown of ['', 'Description.', '@param value description', '@param <T> type']) {
            expect(validateJavadoc(markdown, declaration)).toEqual([]);
        }
    });

    it('warns about an incomplete parameter tag', () => {
        expect(validateJavadoc('@param', declaration).map(diagnostic => diagnostic.code))
            .toEqual(['missing-parameter-name']);
    });

    it('warns on parameter order while ignoring missing tags, duplicates, and unknown names for ordering', () => {
        const diagnostics = validateJavadoc('@param value value\n@param unknown description\n@param value duplicate\n@param count count\n@param <T> type', declaration);
        const ordering = diagnostics.filter(diagnostic => diagnostic.code === 'parameter-order');
        expect(ordering.map(diagnostic => diagnostic.startLineNumber)).toEqual([4, 5]);
        expect(ordering.every(diagnostic => diagnostic.severity === 'warning')).toBe(true);
        expect(validateJavadoc('@param <T> type\n@param value value', declaration)
            .map(diagnostic => diagnostic.code)).toEqual([]);
    });

    it('ignores example tags in fenced, indented, inline, escaped, and quoted code', () => {
        const markdown = '```java\n@param fake example\n```\n~~~\n@param fake example\n~~~\n    @param fake example\n`@param fake example`\n\\@param fake example\n> @param fake example';
        expect(validateJavadoc(markdown, declaration).map(diagnostic => diagnostic.code)).toEqual([]);
    });
});

describe('Javadoc block tag ordering', () => {
    const noParameters: JavadocDeclaration = { type: 'method', exceptions: [], typeParameters: [], parameters: [], returnsValue: false };

    it('warns when return, throws, since, and see tags are out of order', () => {
        const diagnostics = validateJavadoc('@see Other\n@since 1.0\n@throws Exception reason\n@return result', noParameters);
        expect(diagnostics.map(diagnostic => diagnostic.code)).toEqual(['tag-order', 'tag-order', 'tag-order']);
        expect(diagnostics.every(diagnostic => diagnostic.message.includes('before @see'))).toBe(true);
    });

    it('accepts the editorial order, repeated tag groups, exception aliases, and custom tags', () => {
        const markdown = 'Summary.\n\n@apiNote Usage.\n\nMore usage details.\n```java\n@return example\n```\n@implSpec Contract.\n@implNote Details.\n@author Author\n@version 1\n@return result\n@throws Exception reason\n@exception Other reason\n@custom extension\n@since 1.0\n@see First\n@see Second\n@deprecated reason\n@hidden';
        expect(validateJavadoc(markdown, noParameters)).toEqual([]);
    });
});
