import type { CancellationToken, IPosition, IRange, languages } from "monaco-editor";
import { editor, Range, Uri } from "monaco-editor";
import { openCodeTab } from '../logic/tabs';
import { getTokenLocation, type Token } from '../logic/Tokens';
import { selectedFile } from "../logic/State";
import type { DecompileResult } from "../workers/decompile/types";
import { BehaviorSubject } from "rxjs";
import { classNameFromClassFilePath, outerClassFilePath, toClassFilePath, type ClassFilePath, type ClassName } from "../utils/Names";
import { findDeclaration } from "../logic/FindDeclaration.ts";
import { escapeStringLiteral } from "../logic/Search";

export type TokenJumpTarget = {
    className: ClassFilePath;
    targetType: 'method' | 'field' | 'class';
    target: string;
    owner?: ClassName;
    stringLiteral?: string;
};

export const pendingTokenJump = new BehaviorSubject<TokenJumpTarget | null>(null);

export function requestTokenJump(className: ClassFilePath, targetType: 'method' | 'field' | 'class', target: string, owner?: ClassName) {
    pendingTokenJump.next({ className, targetType, target, owner });
}

export function requestStringLiteralJump(
    className: ClassFilePath,
    targetType: "method" | "field" | "class",
    target: string,
    owner: ClassName,
    literal: string
) {
    pendingTokenJump.next({ className, targetType, target, owner, stringLiteral: literal });
}

export function clearTokenJump() {
    pendingTokenJump.next(null);
}

export function jumpToToken(
    result: DecompileResult,
    targetType: 'method' | 'field' | 'class',
    target: string,
    editor: editor.ICodeEditor,
    owner?: ClassName,
    stringLiteral?: string
) {
    const lambdaOuterMethod = targetType === "method"
        ? getLambdaOuterMethodName(target.split(":", 1)[0])
        : null;

    if (lambdaOuterMethod !== null) {
        const className = owner ?? result.className;
        if (lambdaOuterMethod === "static") {
            jumpToToken(result, "class", className, editor, undefined, stringLiteral);
            return;
        }

        const enclosingMethod = result.tokens.find(token =>
            token.declaration
            && token.type === "method"
            && token.name === lambdaOuterMethod
            && token.className === className
        );
        if (enclosingMethod) {
            if (stringLiteral !== undefined) {
                selectStringLiteralInMember(result, enclosingMethod, stringLiteral, editor);
                return;
            }
            selectToken(result, enclosingMethod, editor);
            return;
        }

        jumpToToken(result, "class", className, editor, undefined, stringLiteral);
        return;
    }

    for (const token of result.tokens) {
        if (!(token.declaration && token.type == targetType)) continue;
        if (owner && token.className !== owner) continue;

        let tokenIdentifier: string | null = null;
        if (targetType === "method" && "descriptor" in token) {
            // For methods, target format is "methodName:descriptor"
            tokenIdentifier = `${token.name}:${token.descriptor}`;
        } else if (targetType === "field" && "name" in token) {
            tokenIdentifier = token.name;
        } else if (targetType === "class") {
            tokenIdentifier = token.className;
        }

        if (tokenIdentifier !== target) continue;

        if (stringLiteral !== undefined) {
            selectStringLiteralInMember(result, token, stringLiteral, editor);
            return;
        }

        const { line, column } = getTokenLocation(result, token);
        editor.setSelection(new Range(line, column, line, column + token.length));
        editor.revealLineInCenter(line, 0);
        editor.focus();
        return;
    }

    console.warn(`jumpToToken: Target ${targetType} "${target}" not found in ${result.className}`);
}

function getLambdaOuterMethodName(methodName: string): string | null {
    return /^lambda\$(.+)\$\d+$/.exec(methodName)?.[1] ?? null;
}

function selectToken(result: DecompileResult, token: Token, editor: editor.ICodeEditor) {
    const { line, column } = getTokenLocation(result, token);
    editor.setSelection(new Range(line, column, line, column + token.length));
    editor.revealLineInCenter(line, 0);
}

function selectStringLiteralInMember(result: DecompileResult, member: Token, literal: string, editor: editor.ICodeEditor) {
    const source = result.source;
    const start = source.lastIndexOf("\n", member.start - 1) + 1;
    let end = source.length;

    if (member.type === "method") {
        const indentation = source.slice(start, member.start).match(/^\s*/)?.[0] ?? "";
        let lineStart = source.indexOf("\n", member.start) + 1;

        while (lineStart > 0 && lineStart < source.length) {
            const newline = source.indexOf("\n", lineStart);
            const lineEnd = newline === -1 ? source.length : newline;
            const line = source.slice(lineStart, lineEnd).replace(/\r$/, "");
            if ((line.match(/^\s*/)?.[0] ?? "") === indentation && line.trimStart().startsWith("}")) {
                end = lineStart;
                break;
            }
            if (newline === -1) break;
            lineStart = newline + 1;
        }
    }

    const match = findStringLiteralInRange(source, { start, end }, literal);
    const model = editor.getModel();

    if (!match || !model) {
        console.warn(`jumpToToken: String literal ${JSON.stringify(literal)} not found in ${member.type} "${member.type === "method" ? `${member.name}:${member.descriptor}` : member.type === "field" ? member.name : member.className}" in ${result.className}`);
        return;
    }

    const startPosition = model.getPositionAt(match.start);
    const endPosition = model.getPositionAt(match.end);
    editor.setSelection(new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
    editor.revealLineInCenter(startPosition.lineNumber, 0);
}

function findStringLiteralInRange(source: string, range: { start: number, end: number; }, literal: string): { start: number, end: number; } | null {
    const escapedLiteral = escapeStringLiteral(literal);
    for (const token of getStringLiteralTokens(source)) {
        if (token.start < range.start || token.end > range.end) continue;

        if (source.slice(token.start + 1, token.end - 1) === escapedLiteral) {
            return { start: token.start, end: token.end };
        }
    }

    return null;
}

let cachedStringTokens: { source: string, tokens: { start: number, end: number; }[]; } | null = null;

function getStringLiteralTokens(source: string): { start: number, end: number; }[] {
    if (cachedStringTokens?.source === source) {
        return cachedStringTokens.tokens;
    }

    const lines = source.split(/\r\n|\r|\n/);
    const tokenizedLines = editor.tokenize(source, "java");
    const tokens: { start: number, end: number; }[] = [];
    let lineStart = 0;

    for (let lineIndex = 0; lineIndex < tokenizedLines.length; lineIndex++) {
        const line = lines[lineIndex] ?? "";
        const lineTokens = tokenizedLines[lineIndex];
        let stringStart: number | null = null;
        let stringEnd = 0;

        for (let tokenIndex = 0; tokenIndex < lineTokens.length; tokenIndex++) {
            const token = lineTokens[tokenIndex];
            const tokenStart = token.offset;
            const tokenEnd = lineTokens[tokenIndex + 1]?.offset ?? line.length;
            const isString = token.type.includes("string");

            if (isString) {
                if (line[tokenStart] === '"') {
                    stringStart ??= lineStart + tokenStart;
                }
                stringEnd = lineStart + tokenEnd;
                continue;
            }

            if (stringStart !== null) {
                tokens.push({ start: stringStart, end: stringEnd });
                stringStart = null;
            }
        }

        if (stringStart !== null) {
            tokens.push({ start: stringStart, end: stringEnd });
        }

        lineStart += line.length;
        if (lineIndex < lines.length - 1) {
            lineStart += source[lineStart] === "\r" && source[lineStart + 1] === "\n" ? 2 : 1;
        }
    }

    cachedStringTokens = { source, tokens };
    return tokens;
}

export function createDefinitionProvider(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: string[] | undefined; }
) {
    return {
        async provideDefinition(model: editor.ITextModel, position: IPosition, token: CancellationToken) {
            const { lineNumber, column } = position;

            if (!decompileResultRef.current) {
                console.error("No decompile result available for definition provider.");
                return null;
            }

            const decompileResult = decompileResultRef.current;
            const classList = classListRef.current;

            const lines = model.getLinesContent();
            let charCount = 0;
            let targetOffset = 0;

            for (let i = 0; i < lineNumber - 1; i++) {
                charCount += lines[i].length + 1; // +1 for \n
            }
            targetOffset = charCount + (column - 1);

            for (const token of decompileResult.tokens) {
                if (token.declaration) {
                    continue;
                }

                if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
                    const targetClass = await findDeclaration(token);

                    const className = toClassFilePath(targetClass);
                    const baseClassName = outerClassFilePath(className);
                    console.log(`Found token for definition: ${className} at offset ${token.start}`);

                    if (classList && (classList.includes(className) || classList.includes(baseClassName))) {
                        const range = new Range(lineNumber, column, lineNumber, column + token.length);

                        return {
                            uri: "descriptor" in token ?
                                Uri.parse(`goto://class/${className}#${token.type}:${token.type === "method" ?
                                    `${token.name}:${token.descriptor}` : token.name
                                    }`) :
                                Uri.parse(`goto://class/${className}`),
                            range
                        };
                    }

                    // Library or java classes.
                    return null;
                }

                // Tokens are sorted, we know we can stop searching
                if (token.start > targetOffset) {
                    break;
                }
            }

            return null;
        },
    };
}

export function createEditorOpener(
    decompileResultRef: { current: DecompileResult | undefined; }
) {
    return {
        openCodeEditor: function (editor: editor.ICodeEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): boolean {
            if (!resource.scheme.startsWith("goto")) {
                return false;
            }

            const className = toClassFilePath(resource.path.substring(1));
            const baseClassName = className.includes('$') ? outerClassFilePath(className) : className;

            const jumpInSameFile = baseClassName === selectedFile.value;
            const fragment = resource.fragment.split(":") as [string, ...string[]];

            if (fragment.length >= 2) {
                const targetType = fragment[0] as 'method' | 'field';

                if (targetType === 'method' && fragment.length === 3) {
                    // Format: method:methodName:descriptor
                    const [_, methodName, descriptor] = fragment;
                    const target = `${methodName}:${descriptor}`;
                    requestTokenJump(baseClassName, targetType, target);
                    if (!jumpInSameFile) {
                        openCodeTab(baseClassName);
                    }
                } else if (targetType === 'field' && fragment.length === 2) {
                    // Format: field:fieldName
                    const target = fragment[1];
                    requestTokenJump(baseClassName, targetType, target);
                    if (!jumpInSameFile) {
                        openCodeTab(baseClassName);
                    }
                }
            } else if (baseClassName != className) {
                // Handle inner class navigation
                const innerClassName = classNameFromClassFilePath(className);
                // Always use the queue, even for same-file jumps
                requestTokenJump(baseClassName, 'class', innerClassName);
                if (!jumpInSameFile) {
                    openCodeTab(baseClassName);
                }
            } else {
                openCodeTab(baseClassName);
            }
            return true;
        }
    };
}

export function createFoldingRangeProvider(monaco: any) {
    function getImportFoldingRanges(lines: string[]) {
        let packageLine: number | null = null;
        let firstImportLine: number | null = null;
        let lastImportLine: number | null = null;

        for (let i = 0; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine.startsWith('package ')) {
                packageLine = i + 1;
            } else if (trimmedLine.startsWith('import ')) {
                if (firstImportLine === null) {
                    firstImportLine = i + 1;
                }
                lastImportLine = i + 1;
            }
        }

        // Check if there's any non-empty line after the last import
        // If not its likely a package-info and doesnt need folding.
        if (lastImportLine !== null) {
            let hasContentAfterImports = false;
            for (let i = lastImportLine; i < lines.length; i++) {
                if (lines[i].trim().length > 0) {
                    hasContentAfterImports = true;
                    break;
                }
            }

            if (!hasContentAfterImports) {
                return [];
            }
        }

        // Include the package line before imports to completely hide them when folded
        if (packageLine !== null && firstImportLine !== null && lastImportLine !== null) {
            return [{
                start: packageLine,
                end: lastImportLine,
                kind: monaco.languages.FoldingRangeKind.Imports
            }];
        } else if (firstImportLine !== null && lastImportLine !== null && firstImportLine < lastImportLine) {
            // Fallback if no package line exists
            return [{
                start: firstImportLine,
                end: lastImportLine,
                kind: monaco.languages.FoldingRangeKind.Imports
            }];
        }

        return [];
    }

    function getBracketFoldingRanges(lines: string[]) {
        const ranges: languages.FoldingRange[] = [];

        const stack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Note that we do start + 1, but not end + 1,
            // so we always show the closing bracket.
            for (const c of line) {
                if (c === "{") {
                    stack.push(i + 1);
                } else if (c === "}") {
                    const start = stack.pop();
                    if (start !== undefined && start !== i) {
                        ranges.push({ start: start, end: i });
                    }
                }
            }
        }

        return ranges;
    }

    return {
        provideFoldingRanges: function (model: editor.ITextModel, context: languages.FoldingContext, token: CancellationToken): languages.ProviderResult<languages.FoldingRange[]> {
            const lines = model.getLinesContent();
            return [...getImportFoldingRanges(lines), ...getBracketFoldingRanges(lines)];
        }
    };
}
