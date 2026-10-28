// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Token } from '../logic/Tokens';
import { toClassName } from '../utils/Names';
import type { DecompileResult } from '../workers/decompile/types';
import type { JarIndex } from '../workers/jar-index/client';
import { JavadocSymbols } from './editor/JavadocSymbols';
import { renderJavadocMarkdown } from './JavadocMarkdown';

async function createSymbols() {
    const owner = toClassName('example/Owner');
    const parent = toClassName('example/Parent');
    const nested = toClassName('example/Owner$Nested');
    const tokens: Token[] = [
        { type: 'class', className: owner, start: 0, length: 5, declaration: true },
        { type: 'class', className: nested, start: 10, length: 6, declaration: true },
    ];
    const index = {
        getClassData: async () => [
            { className: owner, superName: parent, interfaces: [], accessFlags: 1 },
            { className: parent, superName: '', interfaces: [], accessFlags: 1 },
            { className: nested, superName: '', interfaces: [], accessFlags: 1 },
            { className: toClassName('other/Remote'), superName: '', interfaces: [], accessFlags: 1 },
        ],
        getMemberData: async () => [
            {
                className: owner,
                methods: ['example/Owner:run:(I)V', 'example/Owner:run:([Ljava/lang/String;)V', 'example/Owner:<init>:()V'],
                fields: [], methodAccess: {}, methodBridges: {},
            },
            {
                className: parent,
                methods: ['example/Parent:inherited:()V'],
                fields: ['example/Parent:VALUE:I'], methodAccess: {}, methodBridges: {},
            },
        ],
    } as unknown as JarIndex;
    const result = { source: 'import other.Remote;', tokens } as DecompileResult;
    const symbols = new JavadocSymbols(result, owner, index);
    await symbols.ready;
    return symbols;
}

async function render(markdown: string, kind: Token['type'] = 'class') {
    const symbols = await createSymbols();
    const rendered = renderJavadocMarkdown(markdown, symbols, { kind });
    const element = document.createElement('div');
    element.innerHTML = rendered.html;
    return { ...rendered, element };
}

describe('Javadoc Markdown', () => {
    it('renders Markdown, code examples, and tables', async () => {
        const { element } = await render('# Title\n\n**Strong** and *emphasis*.\n\n- item\n\n```java\nint value = 1;\n```\n\n| A | B |\n| - | - |\n| 1 | 2 |');
        expect(element.querySelector('h2')?.textContent).toBe('Title');
        expect(element.querySelector('strong')?.textContent).toBe('Strong');
        expect(element.querySelector('em')?.textContent).toBe('emphasis');
        expect(element.querySelector('li')?.textContent).toBe('item');
        expect(element.querySelector('pre > code.language-java')?.textContent).toBe('int value = 1;\n');
        expect(element.querySelector('td')?.textContent).toBe('1');
    });

    it('resolves shortcut and labelled references with exact member targets', async () => {
        const { element, links } = await render('[Remote], [nested class][Owner.Nested], [#run(int)], [#run(String\\[\\])], [#inherited()], [#VALUE], [Owner#Owner()]');
        const anchors = [...element.querySelectorAll('a')];
        expect(anchors.map(anchor => anchor.textContent)).toEqual([
            'Remote', 'nested class', 'run(int)', 'run(String[])', 'inherited()', 'VALUE', 'Owner()',
        ]);
        expect([...links.values()].map(token => token.className)).toEqual([
            'other/Remote', 'example/Owner$Nested', 'example/Owner', 'example/Owner', 'example/Parent', 'example/Parent', 'example/Owner',
        ]);
        expect([...links.values()][3]).toMatchObject({ type: 'method', name: 'run', descriptor: '([Ljava/lang/String;)V' });
        expect([...links.values()][6]).toMatchObject({ type: 'method', name: '<init>', descriptor: '()V' });
    });

    it('preserves ordinary Markdown links, definitions, escaped brackets, and code', async () => {
        const { element, links } = await render('[Remote](https://example.com) [site][Remote]\n\n[Remote]: https://example.org\n\n`[Owner]` \\[Owner] [Unknown] [#run]\n\n```java\n[Owner]\n@param value example\n```\n\n    @see Owner');
        expect([...element.querySelectorAll('a')].map(anchor => anchor.getAttribute('href'))).toEqual(['https://example.com', 'https://example.org']);
        expect(links.size).toBe(0);
        expect(element.querySelector('dl')).toBeNull();
        expect(element.textContent).toContain('[Unknown]');
        expect(element.textContent).toContain('[#run]');
    });

    it('renders all completed block tags with multiline Markdown descriptions', async () => {
        const { element, links } = await render(`Description.
@param <T> the **type**
@param value the value
@return the result
@throws Remote when unavailable
@exception Remote another case
@see Owner#run(int) custom description
@since 1.0
@deprecated Use [Remote].
@apiNote
API guidance.

- first
- second
@implSpec Implementation requirements.
@implNote Implementation details.
@author Author
@version 2.0
@hidden`);
        expect([...element.querySelectorAll('dt')].map(tag => tag.textContent)).toEqual([
            'Type Parameters:', 'Parameters:', 'Returns:', 'Throws:', 'Since:', 'Version:', 'Author:', 'See Also:', 'API Note:',
            'Implementation Requirements:', 'Implementation Note:', 'Hidden:',
        ]);
        expect(element.querySelector('dd code')?.textContent).toBe('T');
        expect(element.querySelector('dd strong')?.textContent).toBe('type');
        expect(element.querySelectorAll('dd ul:not(.tag-list) > li')).toHaveLength(2);
        expect(element.querySelector('.deprecation-block')?.textContent).toBe('Deprecated.Use Remote.');
        expect(links.size).toBe(4);
        expect(element.textContent).toContain('custom description');
    });

    it('supports Markdown and HTML @see links and leaves unresolved targets readable', async () => {
        const { element } = await render('@see [the class][Remote]\n@see <a href="https://example.com">a website</a>\n@see Unknown missing class\n@custom Some **custom** tag');
        expect(element.querySelectorAll('a')).toHaveLength(2);
        expect(element.textContent).toContain('Unknown missing class');
        expect(element.querySelector('strong')?.textContent).toBe('custom');
    });

    it('shares Markdown link definitions between the body and tag descriptions', async () => {
        const { element, links } = await render('[Remote]\n\n[Remote]: https://example.com\n\n@see [Remote]\n@apiNote [website][Remote]');
        expect([...element.querySelectorAll('a')].map(anchor => anchor.getAttribute('href'))).toEqual([
            'https://example.com', 'https://example.com', 'https://example.com',
        ]);
        expect(links.size).toBe(0);
    });

    it('renders collapsed and matching Java reference labels in code font', async () => {
        const { element, links } = await render('[Owner][] [Owner][Owner] [#run(int)][] [run this][#run(int)]');
        expect([...element.querySelectorAll('a')].map(anchor => anchor.textContent)).toEqual(['Owner', 'Owner', 'run(int)', 'run this']);
        expect(element.querySelectorAll('a > code')).toHaveLength(3);
        expect(element.textContent).not.toContain('[]');
        expect(links.size).toBe(4);
    });

    it('uses JavaDoc heading levels for members, capped at h6', async () => {
        const { element } = await render('# Usage\n\n### Details\n\n###### Deep heading', 'method');
        expect([...element.querySelectorAll('h4, h6')].map(heading => heading.tagName)).toEqual(['H4', 'H6', 'H6']);
    });

    it('keeps unsupported GFM extensions literal while still rendering tables', async () => {
        const { element } = await render('https://example.com\n\n~~text~~\n\n- [x] task\n\n| A | B |\n| - | - |\n| 1 | 2 |');
        expect(element.querySelector('a, del, input')).toBeNull();
        expect(element.textContent).toContain('~~text~~');
        expect(element.textContent).toContain('[x]');
        expect(element.querySelector('table')).not.toBeNull();
    });

    it('sanitizes executable HTML and unsafe URLs in prose and tags', async () => {
        const { element } = await render('<img src="x" onerror="alert(1)"><script>alert(1)</script>\n\n[unsafe](javascript:alert%281%29)\n\n@apiNote <svg onload="alert(1)"></svg>\n@see <a href="javascript:alert(1)">unsafe</a>');
        expect(element.querySelector('script, [onerror], [onload], a[href^="javascript:"]')).toBeNull();
    });
});

describe('Javadoc reference resolution', () => {
    it('does not guess ambiguous overloads or incorrect parameter signatures', async () => {
        const symbols = await createSymbols();
        expect(symbols.resolveReference('#run')).toBeUndefined();
        expect(symbols.resolveReference('#run(long)')).toBeUndefined();
        expect(symbols.resolveReference('#VALUE()')).toBeUndefined();
        expect(symbols.resolveReference('#run(java.lang.String...)')).toMatchObject({ descriptor: '([Ljava/lang/String;)V' });
        expect(symbols.resolveReference('example.Owner.Nested')).toMatchObject({ className: 'example/Owner$Nested' });
    });
});
