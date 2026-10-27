import type { editor, IPosition } from 'monaco-editor';

export interface JavadocReference {
    prefix: string;
    startColumn: number;
    endColumn: number;
    hasClosingBracket: boolean;
    hasMemberSuffix: boolean;
}

/** Tracks code spans, fences, and the current reference bracket for documentation completions. */
export function getMarkdownContext(model: editor.ITextModel, position: IPosition): { openBracket: number; inCode: boolean } {
    const text = model.getValue();
    let fence: { marker: string; length: number } | undefined;
    let codeSpanLength = 0;
    let openBracket = -1;

    for (let lineNumber = 1; lineNumber <= position.lineNumber; lineNumber++) {
        const line = model.getLineContent(lineNumber);
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
                    const remainingText = text.slice(model.getOffsetAt({ lineNumber, column: end + 1 }));
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
    const { openBracket, inCode } = getMarkdownContext(model, position);
    if (inCode || openBracket < 0) {
        return null;
    }
    const line = model.getLineContent(position.lineNumber);
    if (line[openBracket - 1] === '!') {
        return null;
    }
    const cursor = position.column - 1;
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
    return { prefix, startColumn: openBracket + 2, endColumn: replacementEnd + 1, hasClosingBracket, hasMemberSuffix };
}
