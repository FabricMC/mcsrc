import type { editor, IPosition } from 'monaco-editor';

export interface JavadocReference {
    syntax: 'markdown' | 'see';
    prefix: string;
    startColumn: number;
    endColumn: number;
    hasClosingBracket: boolean;
    hasMemberSuffix: boolean;
}

function getSeeReference(line: string, cursor: number): JavadocReference | null {
    const tag = /^ {0,3}@see[\t ]+/.exec(line);
    if (!tag || cursor < tag[0].length) return null;

    const start = tag[0].length;
    if (/["<[]/u.test(line[start] ?? '')) return null;

    let end = start;
    let parentheses = 0;
    while (end < line.length) {
        const character = line[end];
        if (character === '(') parentheses++;
        if (character === ')') parentheses--;
        if (!/[\p{ID_Continue}$.#(),[\]]/u.test(character) && !(parentheses > 0 && /[\t ]/.test(character))) {
            break;
        }
        end++;
    }
    if (cursor > end) return null;

    const prefix = line.slice(start, cursor);
    if (!/^[\p{ID_Continue}$.]*(?:#[\p{ID_Continue}$]*(?:\([\p{ID_Continue}$.,[\]\s]*\)?)?)?$/u.test(prefix)) {
        return null;
    }
    // Quoted text, HTML links, and Markdown links are not bare Java references.
    if (end === start && line[start] && !/[\t ]/.test(line[start])) return null;

    const memberSeparator = line.indexOf('#', cursor);
    const hasMemberSuffix = !prefix.includes('#') && memberSeparator >= cursor && memberSeparator < end;
    return {
        syntax: 'see', prefix, startColumn: start + 1,
        endColumn: (hasMemberSuffix ? memberSeparator : end) + 1,
        hasClosingBracket: false, hasMemberSuffix,
    };
}

/** Tracks code spans, fences, and the current reference bracket for documentation completions. */
export function getMarkdownContext(text: string, position: IPosition): { openBracket: number; inCode: boolean } {
    const lines = text.split('\n');
    let offset = 0;
    let fence: { marker: string; length: number } | undefined;
    let codeSpanLength = 0;
    let openBracket = -1;

    for (let lineNumber = 1; lineNumber <= position.lineNumber; lineNumber++) {
        const line = lines[lineNumber - 1];
        const lineStart = offset;
        offset += line.length + 1;
        if (!fence && codeSpanLength === 0 && /^(?: {4}| {0,3}\t)/.test(line)) {
            if (lineNumber === position.lineNumber) return { openBracket: -1, inCode: true };

            continue;
        }
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
        if (fenceMatch && codeSpanLength === 0) {
            const marker = fenceMatch[1][0];
            const length = fenceMatch[1].length;
            if (fence) {
                if (marker === fence.marker && length >= fence.length && !fenceMatch[2].trim()) {
                    fence = undefined;
                }
            } else if (marker !== '`' || !fenceMatch[2].includes('`')) {
                fence = { marker, length };
            }
            if (lineNumber === position.lineNumber) {
                return { openBracket: -1, inCode: true };
            }
            continue;
        }
        if (fence) {
            continue;
        }

        openBracket = -1;
        const limit = lineNumber === position.lineNumber ? position.column - 1 : line.length;
        for (let index = 0; index < limit; index++) {
            const character = line[index];
            if (character === '\\' && codeSpanLength === 0) {
                index++;
                continue;
            }
            if (character === '`') {
                let end = index + 1;
                while (line[end] === '`') {
                    end++;
                }
                const length = end - index;
                if (codeSpanLength === 0) {
                    // Unmatched backticks are literal Markdown text.
                    const remainingText = text.slice(lineStart + end);
                    const closingDelimiter = new RegExp(`(?<!\x60)\x60{${length}}(?!\x60)`);
                    if (closingDelimiter.test(remainingText)) {
                        codeSpanLength = length;
                    }
                } else if (codeSpanLength === length) {
                    codeSpanLength = 0;
                }
                index = end - 1;
                continue;
            }
            if (codeSpanLength !== 0) {
                continue;
            }
            if (character === '[') {
                openBracket = index;
            } else if (character === ']') {
                openBracket = -1;
            }
        }
    }

    return { openBracket, inCode: fence !== undefined || codeSpanLength !== 0 };
}

/** Finds a Java reference while leaving Markdown code and ordinary links alone. */
export function getJavadocReference(model: editor.ITextModel, position: IPosition): JavadocReference | null {
    const { openBracket, inCode } = getMarkdownContext(model.getValue(), position);
    if (inCode) {
        return null;
    }
    const line = model.getLineContent(position.lineNumber);
    const cursor = position.column - 1;
    const seeTag = /^ {0,3}@see[\t ]+/.exec(line);
    if (seeTag && line[seeTag[0].length] !== '[') {
        return getSeeReference(line, cursor);
    }
    if (openBracket < 0) return null;

    if (line[openBracket - 1] === '!') {
        return null;
    }
    const prefix = line.slice(openBracket + 1, cursor);
    if (!/^[\w.$]*(?:#[\w$]*(?:\([\w.$,\\[\]\s]*\)?)?)?$/.test(prefix)) {
        return null;
    }

    let end = cursor;
    while (end < line.length) {
        if (line[end] === '\\' && /[[\]]/.test(line[end + 1] ?? '')) {
            end += 2;
        } else if (/[\w.$#(),\s]/.test(line[end])) {
            end++;
        } else {
            break;
        }
    }
    const hasClosingBracket = line[end] === ']';
    if (hasClosingBracket && /[(:[]/.test(line[end + 1] ?? '')) {
        return null;
    }
    // Without a closing bracket, do not replace prose following an unfinished reference.
    if (!hasClosingBracket) {
        end = cursor;
        while (/[\w.$#(),]/.test(line[end] ?? '') && end < line.length) {
            end++;
        }
    }

    const memberSeparator = line.indexOf('#', cursor);
    const hasMemberSuffix = !prefix.includes('#') && memberSeparator >= cursor && memberSeparator < end;
    const replacementEnd = hasMemberSuffix ? memberSeparator : end;
    return { syntax: 'markdown', prefix, startColumn: openBracket + 2, endColumn: replacementEnd + 1, hasClosingBracket, hasMemberSuffix };
}
