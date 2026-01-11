import type { CancellationToken, IDisposable, IPosition, IRange, languages } from "monaco-editor";
import { editor, Range, Uri } from "monaco-editor";
import type { DecompileResult } from '../logic/Decompiler';
import { currentResult, getDecompilationResult } from '../logic/Decompiler';
import { activeTabKey, openTab } from '../logic/Tabs';
import { getTokenLocation } from '../logic/Tokens';
import { filter, take } from "rxjs";
import type { MinecraftJar } from "../logic/MinecraftApi";

export async function getUriDecompilationResult(jar: MinecraftJar, uri: Uri): Promise<DecompileResult> {
    const options = new URLSearchParams(uri.query);
    const option = options.has("bytecode") ? "bytecode" : options.has("lambdas") ? "lambdas" : undefined;

    return await getDecompilationResult(jar, uri.path, option);
}

export async function jumpToToken(
    jar: MinecraftJar,
    targetType: 'method' | 'field' | 'class',
    target: string,
    editor: editor.ICodeEditor,
    sameFile = false
) {
    const model = editor.getModel();
    if (!model) return;
    const result = await getUriDecompilationResult(jar, model.uri);

    for (const token of result.tokens) {
        if (!(token.declaration && token.type == targetType)) continue;
        if (
            !(targetType === "method" && "descriptor" in token && token.descriptor === target) &&
            !(targetType === "field" && "name" in token && token.name === target) &&
            !(targetType === "class" && token.className === target)
        ) continue;

        const { line, column } = getTokenLocation(result, token);
        let listener: IDisposable;
        const updateSelection = () => {
            if (listener) listener.dispose();
            editor.setSelection(new Range(line, column, line, column + token.length));
        };
        if (sameFile) {
            updateSelection();
            editor.revealLineInCenter(line, 0);
        } else {
            listener = editor.onDidChangeModelContent(() => {
                // Wait for DOM to settle
                queueMicrotask(updateSelection);
            });
        }
        break;
    }
}

export function createDefinitionProvider(
    jar: MinecraftJar,
    classListRef: { current: string[] | undefined; }
) {
    return {
        async provideDefinition(model: editor.ITextModel, position: IPosition, token: CancellationToken) {
            const { lineNumber, column } = position;

            const result = await getUriDecompilationResult(jar, model.uri);
            if (!result) return;

            const classList = classListRef.current;

            const lines = model.getLinesContent();
            let charCount = 0;
            let targetOffset = 0;

            for (let i = 0; i < lineNumber - 1; i++) {
                charCount += lines[i].length + 1; // +1 for \n
            }
            targetOffset = charCount + (column - 1);

            for (const token of result.tokens) {
                if (token.declaration) {
                    continue;
                }

                if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
                    const className = token.className + ".class";
                    const baseClassName = token.className.split('$')[0] + ".class";
                    console.log(`Found token for definition: ${className} at offset ${token.start}`);

                    if (classList && (classList.includes(className) || classList.includes(baseClassName))) {
                        const targetClass = className;
                        const range = new Range(lineNumber, column, lineNumber, column + token.length);

                        return {
                            uri: "descriptor" in token ?
                                Uri.parse(`goto://class/${className}#${token.type}:${token.type === "method" ?
                                    token.descriptor : token.name
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

export function createEditorOpener(jar: MinecraftJar) {
    return {
        openCodeEditor: async function (editor: editor.ICodeEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): Promise<boolean> {
            if (!resource.scheme.startsWith("goto")) {
                return false;
            }

            const className = resource.path.substring(1);
            const baseClassName = className.includes('$') ? className.split('$')[0] + ".class" : className;
            console.log(className);
            console.log(baseClassName);

            const jumpInSameFile = baseClassName === activeTabKey.value;
            const fragment = resource.fragment.split(":") as ['method' | 'field', string];
            if (fragment.length === 2) {
                const [targetType, target] = fragment;
                if (jumpInSameFile) {
                    jumpToToken(jar, targetType, target, editor, true);
                } else {
                    const subscription = currentResult.pipe(filter(value => value.className === baseClassName), take(1)).subscribe(value => {
                        subscription.unsubscribe();
                        jumpToToken(jar, targetType, target, editor);
                    });
                }
            } else if (baseClassName != className) {
                // Handle inner class navigation
                const innerClassName = className.replace('.class', '');
                if (jumpInSameFile) {
                    jumpToToken(jar, 'class', innerClassName, editor, true);
                } else {
                    const subscription = currentResult.pipe(filter(value => value.className === baseClassName), take(1)).subscribe(value => {
                        subscription.unsubscribe();
                        jumpToToken(jar, 'class', innerClassName, editor);
                    });
                }
            }
            openTab(baseClassName);
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
