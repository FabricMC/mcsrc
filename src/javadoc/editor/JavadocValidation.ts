import type { JavadocDeclaration } from './JavadocDeclaration';
import { readJavadocBlockTags, type JavadocBlockTag } from './JavadocBlockTags';

export interface JavadocDiagnostic {
    severity: 'error' | 'warning';
    code: string;
    message: string;
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
}

// Editorial ordering only; tags remain valid Javadoc in other orders.
const tagOrder = [
    'apiNote', 'implSpec', 'implNote', 'author', 'version',
    'param', 'return', 'throws', 'since', 'see', 'deprecated', 'hidden',
];

function diagnostic(tag: JavadocBlockTag, severity: JavadocDiagnostic['severity'], code: string, message: string, parameter = false): JavadocDiagnostic {
    const startColumn = parameter ? tag.parameterColumn ?? tag.column : tag.column;
    const length = parameter ? tag.parameter?.length ?? tag.name.length + 1 : tag.name.length + 1;
    return {
        severity, code, message,
        startLineNumber: tag.line, endLineNumber: tag.line,
        startColumn, endColumn: startColumn + length,
    };
}

function validateParameters(tags: JavadocBlockTag[], declaration: JavadocDeclaration): JavadocDiagnostic[] {
    const diagnostics: JavadocDiagnostic[] = [];
    const expected = [...declaration.typeParameters, ...declaration.parameters];
    const seen = new Set<string>();
    let highestIndex = -1;
    for (const tag of tags) {
        if (tag.name !== 'param') continue;

        const name = tag.parameter;
        if (!name) {
            diagnostics.push(diagnostic(tag, 'warning', 'missing-parameter-name', 'Specify a parameter name after @param.'));
            continue;
        }
        const index = expected.indexOf(name);
        if (index < 0) {
            diagnostics.push(diagnostic(tag, 'error', 'unknown-parameter', `Unknown parameter '${name}'.`, true));
        }
        if (seen.has(name)) {
            diagnostics.push(diagnostic(tag, 'error', 'duplicate-parameter', `Parameter '${name}' is already documented.`, true));
        } else if (index >= 0) {
            if (index < highestIndex) {
                diagnostics.push(diagnostic(tag, 'warning', 'parameter-order', 'Document type parameters first, then value parameters in declaration order.', true));
            }
            highestIndex = Math.max(highestIndex, index);
        }
        seen.add(name);
        if (!tag.description.trim()) {
            diagnostics.push(diagnostic(tag, 'warning', 'missing-description', `Add a description for parameter '${name}'.`, true));
        }
    }
    return diagnostics;
}

function validateTagOrder(tags: JavadocBlockTag[]): JavadocDiagnostic[] {
    const diagnostics: JavadocDiagnostic[] = [];
    let highestRank = -1;
    let precedingTag = '';
    for (const tag of tags) {
        const rank = getJavadocTagRank(tag.name);
        if (rank < 0) continue;

        if (rank < highestRank) {
            diagnostics.push(diagnostic(tag, 'warning', 'tag-order', `Place @${tag.name} before @${precedingTag}.`));
        } else {
            highestRank = rank;
            precedingTag = tag.name;
        }
    }
    return diagnostics;
}

/** Validates parameter documentation and the editorial ordering of block tags. */
export function validateJavadoc(markdown: string, declaration: JavadocDeclaration): JavadocDiagnostic[] {
    const tags = readJavadocBlockTags(markdown);
    return [...validateParameters(tags, declaration), ...validateTagOrder(tags)];
}

/** Returns the editorial rank of a block tag, or -1 for custom tags. */
export function getJavadocTagRank(name: string): number {
    return tagOrder.indexOf(name === 'exception' ? 'throws' : name);
}
