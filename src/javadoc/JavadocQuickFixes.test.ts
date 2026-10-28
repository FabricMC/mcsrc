import { describe, expect, it } from 'vitest';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { getJavadocQuickFix } from './JavadocQuickFixes';
import { validateJavadoc } from './JavadocValidation';

const declaration: JavadocDeclaration = {
    type: 'method', exceptions: [], typeParameters: ['<T>'], parameters: ['first', 'second'], returnsValue: true,
};

function fix(markdown: string, code: string) {
    const diagnostic = validateJavadoc(markdown, declaration).find(diagnostic => diagnostic.code === code);
    expect(diagnostic).toBeDefined();
    const result = getJavadocQuickFix(markdown, declaration, diagnostic!);
    expect(result).toBeDefined();
    return result!.text;
}

describe('Javadoc quick fixes', () => {
    it('removes unknown tags with their entire multiline descriptions', () => {
        const markdown = 'Summary.\n\n@param wrong Bad parameter.\nMore details.\n```java\n@param example\n```\n@param first Keep this.\n@return Result.';
        expect(fix(markdown, 'unknown-parameter')).toBe('Summary.\n\n@param first Keep this.\n@return Result.');
    });

    it('removes only the duplicate occurrence, preserving the original and adjacent tags', () => {
        const markdown = '@param first Original.\n@param first Duplicate.\nMore duplicate details.\n@param second Keep.';
        expect(fix(markdown, 'duplicate-parameter')).toBe('@param first Original.\n@param second Keep.');
    });

    it('removes an incomplete tag at the end or as the sole content', () => {
        expect(fix('Summary.\n@param', 'missing-parameter-name')).toBe('Summary.');
        expect(fix('@param\n', 'missing-parameter-name')).toBe('');
    });

    it('reorders type and value parameters with paragraphs and code attached', () => {
        const markdown = 'Summary.\n\n@param second Second.\n\nMore details.\n```\n@param example\n```\n@param <T> Type.\n@param first First.\n@return Result.';
        const reordered = fix(markdown, 'parameter-order');
        expect(reordered).toBe('Summary.\n\n@param <T> Type.\n@param first First.\n@param second Second.\n\nMore details.\n```\n@param example\n```\n@return Result.');
        expect(validateJavadoc(reordered, declaration)).toEqual([]);
    });

    it('keeps unrelated tag slots and descriptions when only reordering parameters', () => {
        const markdown = '@param second Second.\n@custom Keep here.\n@param first First.';
        expect(fix(markdown, 'parameter-order')).toBe('@param first First.\n@custom Keep here.\n@param second Second.');
    });

    it('preserves CRLF, blank lines before tags, and the final newline', () => {
        const markdown = '\r\n@param second Second.\r\n@param first First.\r\n';
        expect(fix(markdown, 'parameter-order')).toBe('\r\n@param first First.\r\n@param second Second.\r\n');
    });

    it('reorders block tag groups and parameter tags while preserving their descriptions', () => {
        const markdown = 'Summary.\n@return Result.\nMore return details.\n@param second Second.\n@param <T> Type.\n@param first First.\n@apiNote Usage.\n@see Other';
        const reordered = fix(markdown, 'tag-order');
        expect(reordered).toBe('Summary.\n@apiNote Usage.\n@param <T> Type.\n@param first First.\n@param second Second.\n@return Result.\nMore return details.\n@see Other');
        expect(validateJavadoc(reordered, declaration)).toEqual([]);
    });
});
