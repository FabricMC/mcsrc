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

function reorderBlocks(blocks: TagBlock[], rank: (tag: JavadocBlockTag) => number): TagBlock[] {
    const selected = blocks.filter(block => rank(block.tag) >= 0);
    selected.sort((left, right) => rank(left.tag) - rank(right.tag));
    let index = 0;
    const ordered: TagBlock[] = [];
    for (const block of blocks) {
        if (rank(block.tag) >= 0) {
            ordered.push(selected[index]);
            index++;
        } else {
            ordered.push(block);
        }
    }
    return ordered;
}

/** Builds edits from complete tag blocks so descriptions and code examples move with their tags. */
export function getJavadocQuickFix(markdown: string, declaration: JavadocDeclaration, diagnostic: JavadocDiagnostic): JavadocQuickFix | undefined {
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
    const parameterRank = (tag: JavadocBlockTag) => {
        if (tag.name !== 'param') return -1;

        const index = expected.indexOf(tag.parameter ?? '');
        return index < 0 ? expected.length : index;
    };
    const target = blocks.find(block => block.tag.line === diagnostic.startLineNumber);
    switch (diagnostic.code) {
        case 'unknown-parameter':
        case 'duplicate-parameter':
        case 'missing-parameter-name':
            if (!target || target.tag.name !== 'param') return undefined;
            return {
                title: `Remove ${target.tag.parameter ? `@param ${target.tag.parameter}` : 'incomplete @param'} tag`,
                text: render(blocks.filter(block => block !== target)),
            };
        case 'parameter-order':
            return { title: 'Reorder @param tags to match the declaration', text: render(reorderBlocks(blocks, parameterRank)) };
        case 'tag-order': {
            const ordered = reorderBlocks(blocks, tag => getJavadocTagRank(tag.name));
            return { title: 'Reorder Javadoc tags', text: render(reorderBlocks(ordered, parameterRank)) };
        }
        default:
            return undefined;
    }
}
