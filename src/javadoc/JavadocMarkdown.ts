import DOMPurify from 'dompurify';
import { Lexer, Marked } from 'marked';
import type { Token } from '../logic/Tokens';
import { readJavadocBlockTags, type JavadocBlockTag } from './editor/JavadocBlockTags';
import type { JavadocSymbols } from './editor/JavadocSymbols';

const tagLabels: Record<string, string> = {
    typeParam: 'Type Parameters:',
    param: 'Parameters:',
    return: 'Returns:',
    throws: 'Throws:',
    since: 'Since:',
    version: 'Version:',
    author: 'Author:',
    see: 'See Also:',
    apiNote: 'API Note:',
    implSpec: 'Implementation Requirements:',
    implNote: 'Implementation Note:',
    hidden: 'Hidden:',
};

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, character => `&#${character.charCodeAt(0)};`);
}

/** Renders Markdown and Java references using the same symbols and block tags as completion. */
export function renderJavadocMarkdown(markdown: string, symbols: JavadocSymbols, { kind = 'class' }: { kind?: Token['type'] } = {}): { html: string; links: Map<string, Token> } {
    const links = new Map<string, Token>();
    const definitions = new Marked().lexer(markdown).links;
    const referenceHref = (reference: string) => {
        const target = symbols.resolveReference(reference.replace(/\\([[\]])/g, '$1'));
        if (!target) return undefined;

        const href = `#javadoc-${links.size}`;
        links.set(href, target);
        return href;
    };
    const referenceLabel = (reference: string) => {
        const [owner, member] = reference.split('#');
        if (!member) return reference;

        const className = owner ? symbols.resolveClass(owner) : symbols.owner;
        return className === symbols.owner ? member : `${owner}.${member}`;
    };
    const parser = new Marked({
        async: false,
        renderer: {
            heading({ depth, tokens }) {
                const level = Math.min(6, depth + (kind === 'class' ? 1 : 3));
                return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
            },
            checkbox({ checked }) {
                return checked ? '[x]' : '[ ]';
            },
        },
        hooks: {
            provideLexer(block) {
                return (source, options) => {
                    const lexer = new Lexer(options);
                    // Block tag descriptions share the document's Markdown link definitions.
                    lexer.tokens.links = { ...definitions };
                    return block ? lexer.lex(source) : lexer.inlineTokens(source);
                };
            },
        },
        tokenizer: {
            // JavaDoc supports CommonMark plus tables, rather than all GFM extensions.
            del() {
                return undefined;
            },
            url() {
                return undefined;
            },
            reflink(source, definitions) {
                const match = /^\[((?:\\.|[^\]\\])+)\](?:\[((?:\\.|[^\]\\])*)\])?/.exec(source);
                if (!match) return false;

                const reference = match[2] || match[1];
                const definition = reference.replace(/\s+/g, ' ').toLowerCase();
                if (Object.hasOwn(definitions, definition)) return false;

                const href = referenceHref(reference);
                if (!href) return false;

                const explicitLabel = match[1].replace(/\\([[\]])/g, '$1');
                const sameLabel = match[1] === reference;
                const label = sameLabel ? referenceLabel(explicitLabel) : explicitLabel;
                const tokens = sameLabel ? [{ type: 'codespan', raw: label, text: label }] : this.lexer.inlineTokens(label);
                return { type: 'link', raw: match[0], href, title: null, text: label, tokens };
            },
        },
    });
    const referenceLink = (reference: string, label?: string) => {
        const href = referenceHref(reference);
        const content = label ? parser.parseInline(label, { async: false }) : `<code>${escapeHtml(referenceLabel(reference))}</code>`;
        if (!href && label) return `<code>${escapeHtml(reference)}</code> ${content}`;

        return href ? `<a href="${href}">${content}</a>` : content;
    };
    const tags = readJavadocBlockTags(markdown);
    const body = tags.length ? markdown.split('\n').slice(0, tags[0].line - 1).join('\n') : markdown;
    const renderTag = (tag: JavadocBlockTag) => {
        let description = tag.description.trimEnd();
        let subject = '';
        if (tag.parameter) {
            const parameter = tag.parameter.replace(/^<(.+)>$/, '$1');
            subject = `<code>${escapeHtml(parameter)}</code> - `;
        } else if (tag.name === 'throws' || tag.name === 'exception' || tag.name === 'see') {
            const reference = /^([\p{ID_Continue}$.#]+(?:\([^)]*\))?)(?=\s|$)/u.exec(description);
            if (reference) {
                description = description.slice(reference[0].length).trim();
                if (tag.name === 'see') {
                    return referenceLink(reference[1], description || undefined);
                }
                subject = referenceLink(reference[1]) + ' - ';
            }
        }
        const content = description.includes('\n')
            ? parser.parse(description, { async: false })
            : parser.parseInline(description, { async: false });
        return subject + content;
    };
    const groups = new Map<string, JavadocBlockTag[]>();
    for (const tag of tags) {
        let name = tag.name === 'exception' ? 'throws' : tag.name;
        if (name === 'param' && tag.parameter?.startsWith('<')) {
            name = 'typeParam';
        }

        const group = groups.get(name) ?? [];
        group.push(tag);
        groups.set(name, group);
    }
    const renderGroup = (name: string) => {
        const group = groups.get(name);
        if (!group) return '';

        const label = tagLabels[name] ?? `@${name}`;
        const entries = group.map(tag => renderTag(tag));
        const descriptions = name === 'see'
            ? `<dd><ul class="tag-list">${entries.map(entry => `<li>${entry}</li>`).join('\n')}</ul></dd>`
            : entries.map(entry => `<dd>${entry}</dd>`).join('');
        return `<dt>${escapeHtml(label)}</dt>${descriptions}`;
    };
    let html = '';
    if (kind === 'class' && groups.has('typeParam')) {
        html += `<dl class="notes javadoc-tags">${renderGroup('typeParam')}</dl>`;
        groups.delete('typeParam');
    }
    const deprecated = groups.get('deprecated');
    if (deprecated) {
        html += `<div class="deprecation-block"><span class="deprecated-label">Deprecated.</span><div class="deprecation-comment">${deprecated.map(tag => renderTag(tag)).join('')}</div></div>`;
        groups.delete('deprecated');
    }
    html += `<div class="block">${parser.parse(body, { async: false })}</div>`;
    const order = [...Object.keys(tagLabels), ...groups.keys()];
    const names = [...new Set(order)].filter(name => groups.has(name));
    if (names.length) {
        html += `<dl class="notes javadoc-tags">${names.map(renderGroup).join('')}</dl>`;
    }

    return { html: DOMPurify.sanitize(html), links };
}
