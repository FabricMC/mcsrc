import { readJavadocBlockTags, type JavadocBlockTag } from './JavadocBlockTags';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { getJavadocTagRank, type JavadocDiagnostic } from './JavadocValidation';

interface TagBlock {
    tag: JavadocBlockTag;
    text: string;
}

export interface JavadocQuickFix {
    title: string;
    text: string;
}

function reorderParameters(blocks: TagBlock[], expected: string[]): TagBlock[] {
    const parameters = blocks.filter(block => block.tag.name === 'param');
    const rank = (block: TagBlock) => {
        const index = expected.indexOf(block.tag.parameter ?? '');
        return index < 0 ? expected.length : index;
    };
    parameters.sort((left, right) => rank(left) - rank(right));
    let index = 0;
    const ordered: TagBlock[] = [];
    for (const block of blocks) {
        if (block.tag.name === 'param') {
            ordered.push(parameters[index]);
            index++;
        } else {
            ordered.push(block);
        }
    }
    return ordered;
}

function reorderTags(blocks: TagBlock[], expected: string[]): TagBlock[] {
    const known = blocks.filter(block => getJavadocTagRank(block.tag.name) >= 0);
    known.sort((left, right) => getJavadocTagRank(left.tag.name) - getJavadocTagRank(right.tag.name));
    let index = 0;
    const ordered: TagBlock[] = [];
    for (const block of blocks) {
        if (getJavadocTagRank(block.tag.name) >= 0) {
            ordered.push(known[index]);
            index++;
        } else {
            ordered.push(block);
        }
    }
    return reorderParameters(ordered, expected);
}

/** Builds edits from complete tag blocks so descriptions and code examples move with their tags. */
export function getJavadocQuickFixes(markdown: string, declaration: JavadocDeclaration, diagnostic: JavadocDiagnostic): JavadocQuickFix[] {
    const tags = readJavadocBlockTags(markdown);
    const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
    const lines = markdown.split(/\r?\n/);
    const trailingNewline = markdown.endsWith('\n');
    if (trailingNewline) lines.pop();

    const prefix = markdown ? lines.slice(0, tags[0] ? tags[0].line - 1 : lines.length) : [];
    const blocks = tags.map((tag, index) => ({
        tag,
        text: lines.slice(tag.line - 1, tags[index + 1] ? tags[index + 1].line - 1 : lines.length).join(newline),
    }));
    const render = (updated: TagBlock[]) => {
        const parts = [...prefix, ...updated.map(block => block.text)];
        return parts.join(newline) + (trailingNewline && parts.length > 0 ? newline : '');
    };
    const expected = [...declaration.typeParameters, ...declaration.parameters];
    const target = blocks.find(block => block.tag.line === diagnostic.startLineNumber);
    switch (diagnostic.code) {
        case 'unknown-parameter':
        case 'duplicate-parameter':
        case 'missing-parameter-name':
            if (!target || target.tag.name !== 'param') return [];
            return [{
                title: `Remove ${target.tag.parameter ? `@param ${target.tag.parameter}` : 'incomplete @param'} tag`,
                text: render(blocks.filter(block => block !== target)),
            }];
        case 'parameter-order':
            return [{ title: 'Reorder @param tags to match the declaration', text: render(reorderParameters(blocks, expected)) }];
        case 'tag-order':
            return [{ title: 'Reorder Javadoc tags', text: render(reorderTags(blocks, expected)) }];
        default:
            return [];
    }
}
