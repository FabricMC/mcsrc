import Editor, { useMonaco } from '@monaco-editor/react';
import { useObservable } from '../utils/UseObservable';
import { currentResult, type DecompileResult, isDecompiling } from '../logic/Decompiler';
import { useEffect, useRef, useState } from 'react';
import {
    type CancellationToken,
    editor,
    type IDisposable,
    type IMarkdownString,
    type IPosition,
    type IRange,
    languages,
    Range,
    Uri
} from "monaco-editor";
import { isThin } from '../logic/Browser';
import { classesList } from '../logic/JarFile';
import { activeTabKey, getOpenTab, openTab, openTabs, tabHistory } from '../logic/Tabs';
import { message, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { setSelectedFile, state } from '../logic/State';
import { getTokenLocation, type Token } from '../logic/Tokens';
import { filter, pairwise, startWith, take } from "rxjs";
import { getNextJumpToken, nextUsageNavigation, usageQuery } from '../logic/FindUsages';
import { setupJavaBytecodeLanguage } from '../utils/JavaBytecode';
import { IS_JAVADOC_EDITOR } from '../site';
import { applyJavadocCodeExtensions } from '../javadoc/JavadocCodeExtensions';
import { selectedInheritanceClassName } from '../logic/Inheritance';
import { diffView } from '../logic/Diff';
import { bytecode } from '../logic/Settings';

const IS_DEFINITION_CONTEXT_KEY_NAME = "is_definition";

interface IntegerLiteral {
    value: number;
    originalText: string;
    isNegative: boolean;
}

function parseIntegerLiteral(text: string): IntegerLiteral | null {
    // Remove underscores (Java 7+ numeric literal feature)
    const cleanText = text.replace(/_/g, '');

    // Check for negative prefix
    const isNegative = cleanText.startsWith('-');
    const absText = isNegative ? cleanText.slice(1) : cleanText;

    let value: number;

    // Hex: 0x or 0X
    if (/^0[xX][0-9a-fA-F]+[lL]?$/.test(absText)) {
        const hexPart = absText.slice(2).replace(/[lL]$/, '');
        value = parseInt(hexPart, 16);
    }
    // Binary: 0b or 0B
    else if (/^0[bB][01]+[lL]?$/.test(absText)) {
        const binPart = absText.slice(2).replace(/[lL]$/, '');
        value = parseInt(binPart, 2);
    }
    // Octal: 0 followed by digits
    else if (/^0[0-7]+[lL]?$/.test(absText)) {
        const octPart = absText.replace(/[lL]$/, '');
        value = parseInt(octPart, 8);
    }
    // Decimal
    else if (/^\d+[lL]?$/.test(absText)) {
        const decPart = absText.replace(/[lL]$/, '');
        value = parseInt(decPart, 10);
    }
    else {
        return null;
    }

    if (isNaN(value)) {
        return null;
    }

    // Apply negative sign
    if (isNegative) {
        value = -value;
    }

    return { value, originalText: text, isNegative };
}

function intToRGBA(value: number): { r: number; g: number; b: number; a: number; } {
    // Interpret as ARGB (common in Java/Android)
    const a = (value >>> 24) & 0xFF;
    const r = (value >>> 16) & 0xFF;
    const g = (value >>> 8) & 0xFF;
    const b = value & 0xFF;
    return { r, g, b, a };
}

function formatColorPreview(rgba: { r: number; g: number; b: number; a: number; }): string {
    const { r, g, b, a } = rgba;
    const alpha = (a / 255).toFixed(2);

    // Convert to hex color for Monaco's HTML sanitizer
    // Monaco only allows color:#RRGGBB; and background-color:#RRGGBB; in span style attributes when isTrusted is set
    const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    return `<span style="color:${hexColor};">rgba(${r}, ${g}, ${b}, ${alpha})</span>`;
}

function parseDescriptor(descriptor: string): string {
    // Parse method descriptor like "(Ljava/lang/String;I)V" or field descriptor like "Ljava/lang/String;"
    const typeMap: Record<string, string> = {
        'V': 'void',
        'Z': 'boolean',
        'B': 'byte',
        'C': 'char',
        'S': 'short',
        'I': 'int',
        'J': 'long',
        'F': 'float',
        'D': 'double'
    };

    function parseType(desc: string, index: number): [string, number] {
        let arrayDepth = 0;
        while (desc[index] === '[') {
            arrayDepth++;
            index++;
        }

        let type: string;
        let endIndex: number;

        if (desc[index] === 'L') {
            endIndex = desc.indexOf(';', index);
            type = desc.substring(index + 1, endIndex).replace(/\//g, '.');
            endIndex++;
        } else {
            type = typeMap[desc[index]] || desc[index];
            endIndex = index + 1;
        }

        type += '[]'.repeat(arrayDepth);
        return [type, endIndex];
    }

    // Check if it's a method descriptor (starts with '(')
    if (descriptor.startsWith('(')) {
        const endParams = descriptor.indexOf(')');
        const paramsStr = descriptor.substring(1, endParams);
        const returnTypeStr = descriptor.substring(endParams + 1);

        const params: string[] = [];
        let i = 0;
        while (i < paramsStr.length) {
            const [type, nextIndex] = parseType(paramsStr, i);
            params.push(type);
            i = nextIndex;
        }

        const [returnType] = parseType(returnTypeStr, 0);
        return `(${params.join(', ')}) → ${returnType}`;
    } else {
        // Field descriptor
        const [type] = parseType(descriptor, 0);
        return type;
    }
}

function findTokenAtPosition(
    editor: editor.ICodeEditor,
    decompileResult: { tokens: Token[]; } | undefined,
    classList: string[] | undefined,
    useClassList = true
): Token | null {
    const model = editor.getModel();
    if (!model || !decompileResult || (useClassList && !classList)) {
        return null;
    }

    const position = editor.getPosition();
    if (!position) {
        return null;
    }

    const { lineNumber, column } = position;
    const lines = model.getLinesContent();
    let charCount = 0;
    let targetOffset = 0;

    for (let i = 0; i < lineNumber - 1; i++) {
        charCount += lines[i].length + 1; // +1 for \n
    }
    targetOffset = charCount + (column - 1);

    for (const token of decompileResult.tokens) {
        if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
            const baseClassName = token.className.split('$')[0];
            const className = baseClassName + ".class";
            if (!useClassList || classList!.includes(className)) {
                return token;
            }
        }

        if (token.start > targetOffset) {
            break;
        }
    }

    return null;
}

async function setClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

function jumpToToken(result: DecompileResult, targetType: 'method' | 'field' | 'class', target: string, editor: editor.ICodeEditor, sameFile = false) {
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

const Code = () => {
    const monaco = useMonaco();

    const decompileResult = useObservable(currentResult);
    const classList = useObservable(classesList);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const hideMinimap = useObservable(isThin);
    const decompiling = useObservable(isDecompiling);
    const currentState = useObservable(state);
    const nextUsage = useObservable(nextUsageNavigation);

    const decorationsCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const lineHighlightRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const decompileResultRef = useRef(decompileResult);
    const classListRef = useRef(classList);

    const [messageApi, contextHolder] = message.useMessage();

    const [resetViewTrigger, setResetViewTrigger] = useState(false);

    function applyTokenDecorations(model: editor.ITextModel) {
        if (!decompileResult) return;

        // Reapply token decorations for the current tab
        if (editorRef.current && decompileResult.tokens) {
            const decorations = decompileResult.tokens.map(token => {
                const startPos = model.getPositionAt(token.start);
                const endPos = model.getPositionAt(token.start + token.length);
                const canGoTo = !token.declaration && classList && classList.includes(token.className + ".class");

                return {
                    range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                    options: {
                        inlineClassName: token.type + '-token-decoration' + (canGoTo ? "-pointer" : "")
                    }
                };
            });

            decorationsCollectionRef.current?.clear();
            decorationsCollectionRef.current = editorRef.current.createDecorationsCollection(decorations);
        }
    }

    // Keep refs updated
    useEffect(() => {
        decompileResultRef.current = decompileResult;
        classListRef.current = classList;
    }, [decompileResult, classList]);

    useEffect(() => {
        if (!monaco) return;
        if (!editorRef.current) return;
        const editor = editorRef.current;

        const definitionProvider = monaco.languages.registerDefinitionProvider("java", {
            provideDefinition(model, position, token) {
                const { lineNumber, column } = position;

                if (!decompileResult) {
                    console.error("No decompile result available for definition provider.");
                    return null;
                }

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
        });

        const hoverProvider = monaco.languages.registerHoverProvider("java", {
            provideHover(model, position) {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current, false);

                // Check for tokens first (classes, methods, fields, etc.)
                if (token) {
                    const startPos = model.getPositionAt(token.start);
                    const endPos = model.getPositionAt(token.start + token.length);
                    const range = new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);

                    const contents: IMarkdownString[] = [];

                    // Format class name for display
                    const formattedClassName = token.className.replace(/\//g, '.');

                    switch (token.type) {
                        case 'class':
                            contents.push({
                                value: `**Type**\n\n\`\`\`java\n${formattedClassName}\n\`\`\``
                            });
                            break;

                        case 'field':
                            const fieldType = parseDescriptor(token.descriptor);
                            contents.push({
                                value: `**Field**\n\n\`\`\`java\n${fieldType} ${token.name}\n\`\`\`\n\n**Declaring class:** \`${formattedClassName}\``
                            });
                            break;

                        case 'method':
                            const signature = parseDescriptor(token.descriptor);
                            contents.push({
                                value: `**Method**\n\n\`\`\`java\n${token.name}${signature}\n\`\`\`\n\n**Declaring class:** \`${formattedClassName}\``
                            });
                            break;

                        case 'parameter':
                            contents.push({
                                value: `**Parameter**\n\n**Class:** \`${formattedClassName}\``
                            });
                            break;

                        case 'local':
                            contents.push({
                                value: `**Local variable**\n\n**Class:** \`${formattedClassName}\``
                            });
                            break;
                    }

                    return {
                        range,
                        contents
                    };
                }

                // Check for integer literals
                const wordAtPosition = model.getWordAtPosition(position);
                if (!wordAtPosition) {
                    return null;
                }

                // Get the actual text including any prefix characters (-, 0x, etc.)
                const lineContent = model.getLineContent(position.lineNumber);
                const wordStart = wordAtPosition.startColumn - 1;
                const wordEnd = wordAtPosition.endColumn - 1;

                // Expand to include minus sign if present
                let expandedStart = wordStart;
                if (expandedStart > 0 && lineContent[expandedStart - 1] === '-') {
                    expandedStart--;
                }

                const literalText = lineContent.substring(expandedStart, wordEnd);
                const literal = parseIntegerLiteral(literalText);

                if (!literal) {
                    return null;
                }

                const contents: IMarkdownString[] = [];
                const { value } = literal;

                // Build hover content
                let hoverText = `**Integer Literal**\n\n`;
                hoverText += `**Decimal:** \`${value}\`\n\n`;

                // Show hex representation
                if (value >= 0) {
                    hoverText += `**Hex:** \`0x${value.toString(16).toUpperCase()}\`\n\n`;
                } else {
                    // For negative numbers, show both signed and unsigned interpretations
                    const unsigned = value >>> 0; // Convert to unsigned 32-bit
                    hoverText += `**Hex (signed):** \`-0x${(-value).toString(16).toUpperCase()}\`\n\n`;
                    hoverText += `**Hex (unsigned 32-bit):** \`0x${unsigned.toString(16).toUpperCase()}\`\n\n`;
                }

                // Show color preview for values that could be colors
                // Typically ARGB format in Java, show if value fits in 32 bits
                if (value >= 0 && value <= 0xFFFFFFFF) {
                    const rgba = intToRGBA(value);
                    hoverText += `**Color (ARGB):** ${formatColorPreview(rgba)}`;
                } else if (value < 0 && value >= -0x80000000) {
                    // Negative values as unsigned 32-bit
                    const unsigned = value >>> 0;
                    const rgba = intToRGBA(unsigned);
                    hoverText += `**Color (ARGB):** ${formatColorPreview(rgba)}`;
                }

                contents.push({
                    value: hoverText,
                    supportHtml: true,
                    isTrusted: true
                });

                const range = new Range(
                    position.lineNumber,
                    expandedStart + 1,
                    position.lineNumber,
                    wordEnd + 1
                );

                return {
                    range,
                    contents
                };
            }
        });

        const editorOpener = monaco.editor.registerEditorOpener({
            openCodeEditor: function (editor: editor.ICodeEditor, resource: Uri, selectionOrPosition?: IRange | IPosition): boolean | Promise<boolean> {
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
                        jumpToToken(decompileResult!, targetType, target, editor, true);
                    } else {
                        const subscription = currentResult.pipe(filter(value => value.className === baseClassName), take(1)).subscribe(value => {
                            subscription.unsubscribe();
                            jumpToToken(value, targetType, target, editor);
                        });
                    }
                } else if (baseClassName != className) {
                    // Handle inner class navigation
                    const innerClassName = className.replace('.class', '');
                    if (jumpInSameFile) {
                        jumpToToken(decompileResult!, 'class', innerClassName, editor, true);
                    } else {
                        const subscription = currentResult.pipe(filter(value => value.className === baseClassName), take(1)).subscribe(value => {
                            subscription.unsubscribe();
                            jumpToToken(value, 'class', innerClassName, editor);
                        });
                    }
                }
                openTab(baseClassName);
                return true;
            }
        });

        const foldingRange = monaco.languages.registerFoldingRangeProvider("java", {
            provideFoldingRanges: function (model: editor.ITextModel, context: languages.FoldingContext, token: CancellationToken): languages.ProviderResult<languages.FoldingRange[]> {
                const lines = model.getLinesContent();
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
        });
        // }

        const copyAw = monaco.editor.addEditorAction({
            id: 'copy_aw',
            label: 'Copy Class Tweaker / Access Widener',
            contextMenuGroupId: '9_cutcopypaste',
            precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
                if (!token) {
                    messageApi.error("Failed to find token for Class Tweaker entry.");
                    return;
                }

                switch (token.type) {
                    case "class":
                        await setClipboard(`accessible class ${token.className}`);
                        break;
                    case "field":
                        await setClipboard(`accessible field ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                    case "method":
                        await setClipboard(`accessible method ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                    default:
                        messageApi.error("Token is not a class, field, or method.");
                        return;
                }

                messageApi.success("Copied Class Tweaker entry to clipboard.");
            }
        });

        const copyMixin = monaco.editor.addEditorAction({
            id: 'copy_mixin',
            label: 'Copy Mixin Target',
            contextMenuGroupId: '9_cutcopypaste',
            precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
                if (!token) {
                    messageApi.error("Failed to find token for Mixin target.");
                    return;
                }

                switch (token.type) {
                    case "class":
                        await setClipboard(`${token.className}`);
                        break;
                    case "field":
                        await setClipboard(`L${token.className};${token.name}:${token.descriptor}`);
                        break;
                    case "method":
                        await setClipboard(`L${token.className};${token.name}${token.descriptor}`);
                        break;
                    default:
                        messageApi.error("Token is not a class, field, or method.");
                        return;
                }

                messageApi.success("Copied Mixin target to clipboard.");
            }
        });

        const viewUsages = monaco.editor.addEditorAction({
            id: 'find_usages',
            label: 'Find Usages',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 1, // Place before View Inheritance
            precondition: IS_DEFINITION_CONTEXT_KEY_NAME, // TODO this does not contain references to none Minecraft classes 
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
                if (!token) {
                    messageApi.error("Failed to find token for usages.");
                    return;
                }

                switch (token.type) {
                    case "class":
                        usageQuery.next(token.className);
                        break;
                    case "field":
                        usageQuery.next(`${token.className}:${token.name}:${token.descriptor}`);
                        break;
                    case "method":
                        usageQuery.next(`${token.className}:${token.name}:${token.descriptor}`);
                        break;
                    default:
                        messageApi.error("Token is not a class, field, or method.");
                        return;
                }
            }
        });

        const viewInheritance = monaco.editor.addEditorAction({
            id: 'view_inheritance',
            label: 'View Inheritance Hierarchy',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 2, // Place after Find Usages
            run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
                if (!decompileResultRef.current) {
                    messageApi.error("No decompile result available for inheritance view.");
                    return;
                }

                const className = decompileResultRef.current.className.replace('.class', '');
                console.log(`Viewing inheritance for ${className}`);
                selectedInheritanceClassName.next(className);
            }
        });

        const bytecode = setupJavaBytecodeLanguage(monaco);

        return () => {
            // Dispose in the oppsite order
            bytecode.dispose();
            viewInheritance.dispose();
            viewUsages.dispose();
            copyMixin.dispose();
            copyAw.dispose();
            foldingRange.dispose();
            editorOpener.dispose();
            hoverProvider.dispose();
            definitionProvider.dispose();
        };
    }, [monaco, decompileResult, classList, resetViewTrigger]);

    if (IS_JAVADOC_EDITOR) {
        useEffect(() => {
            if (!monaco || !editorRef.current || !decompileResult) return;

            const extensions = applyJavadocCodeExtensions(monaco, editorRef.current, decompileResult);

            return () => {
                extensions.dispose();
            };
        }, [monaco, editorRef.current, decompileResult]);
    }

    // Scroll to top when source changes, or to specific line if specified
    useEffect(() => {
        if (editorRef.current && decompileResult) {
            const editor = editorRef.current;
            const currentTab = openTabs.value.find(tab => tab.key === activeTabKey.value);
            const prevTab = openTabs.value.find(tab => tab.key === tabHistory.value.at(-2));
            if (prevTab) {
                prevTab.scroll = editor.getScrollTop();
            }

            lineHighlightRef.current?.clear();

            const executeScroll = () => {
                const currentLine = state.value?.line;
                if (currentLine) {
                    const lineEnd = state.value?.lineEnd ?? currentLine;
                    editor.setSelection(new Range(currentLine, 1, currentLine, 1));
                    editor.revealLinesInCenterIfOutsideViewport(currentLine, lineEnd);

                    // Highlight the line range
                    lineHighlightRef.current = editor.createDecorationsCollection([{
                        range: new Range(currentLine, 1, lineEnd, 1),
                        options: {
                            isWholeLine: true,
                            className: 'highlighted-line',
                            glyphMarginClassName: 'highlighted-line-glyph'
                        }
                    }]);
                } else if (currentTab && currentTab.scroll > 0) {
                    editor.setScrollTop(currentTab.scroll);
                } else {
                    editor.setScrollTop(0);
                }
            };

            if (decompileResult.language !== "java") {
                // For bytecode, no folding to wait for
                executeScroll();
                return;
            }

            // Wait for folding to complete and DOM to settle
            editor.getAction('editor.foldAll')?.run().then(() => {
                // Use requestAnimationFrame to ensure Monaco has finished layout
                requestAnimationFrame(() => {
                    executeScroll();
                });
            });
        }
    }, [decompileResult, currentState?.line, currentState?.lineEnd]);

    // Scroll to a "Find usages" token
    useEffect(() => {
        if (editorRef.current && decompileResult) {
            if (decompileResult.language !== "java") return;

            const editor = editorRef.current;

            lineHighlightRef.current?.clear();

            const executeScroll = () => {
                const nextJumpToken = getNextJumpToken(decompileResult);
                const nextJumpLocation = nextJumpToken && getTokenLocation(decompileResult, nextJumpToken);

                if (nextJumpLocation) {
                    const { line, column, length } = nextJumpLocation;
                    editor.revealLinesInCenterIfOutsideViewport(line, line);
                    editor.setSelection(new Range(line, column, line, column + length));
                }
            };

            editor.getAction('editor.foldAll')?.run().then(() => {
                requestAnimationFrame(() => {
                    executeScroll();
                });
            });
        }
    }, [decompileResult, nextUsage]);

    // Subscribe to tab changes and store model & viewstate of previously opened tab
    useEffect(() => {
        const sub = activeTabKey.pipe(
            startWith(activeTabKey.value),
            pairwise()
        ).subscribe(([prev, curr]) => {
            if (prev === curr) return;

            const previousTab = openTabs.getValue().find(o => o.key === prev);
            previousTab?.cacheView(
                editorRef.current?.saveViewState() || null,
                editorRef.current?.getModel() || null
            );
        });

        // Cache if diffview is opened and restore if it is closed;
        const sub2 = diffView.subscribe((open) => {
            const openTab = getOpenTab();
            if (open) {
                openTab?.cacheView(
                    editorRef.current?.saveViewState() || null,
                    editorRef.current?.getModel() || null
                );
            } else {
                if (!openTab) return;
                setSelectedFile(openTab.key);

                // While this is not perfect, it works because leaving the diff view
                // makes the view invisible and doesn't apply any of the custom "extensions",
                // manually forcing a rerender works ^-^
                setTimeout(() => {
                    setResetViewTrigger(!resetViewTrigger);
                }, 100);
            }
        });

        return () => {
            sub.unsubscribe();
            sub2.unsubscribe();
        };
    }, []);

    // Handles setting the model and viewstate of the editor
    useEffect(() => {
        if (diffView.value) return;
        if (!monaco || !decompileResult) return;

        const tab = getOpenTab();
        if (!tab) return;
        const lang = bytecode.value ? "bytecode" : "java";

        // Create new model with the current decompilation source
        let newModel = monaco.editor.createModel(
            decompileResult.source,
            lang,
            monaco.Uri.parse(`inmemory://${Date.now()}`)
        );

        // Check if the model is different to the cached one. If yes -> invalidate view
        if (!tab.isCachedModelEqualTo(newModel)) {
            tab.invalidateCachedView();
            tab.model = newModel;
        } else {
            newModel.dispose();
        }

        if (editorRef.current) tab.applyViewToEditor(editorRef.current);
        applyTokenDecorations(tab.model!);
    }, [decompileResult, resetViewTrigger]);

    return (
        <Spin
            indicator={<LoadingOutlined spin />}
            size={"large"}
            spinning={!!decompiling}
            tip="Decompiling..."
            style={{
                height: '100%',
                color: 'white'
            }}
        >
            {contextHolder}
            <Editor
                height="100vh"
                defaultLanguage={"java"}
                language={decompileResult?.language}
                theme="vs-dark"
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    tabSize: 3,
                    minimap: { enabled: !hideMinimap },
                    glyphMargin: true,
                    foldingImportsByDefault: true,
                    foldingHighlight: false
                }}
                onMount={(codeEditor) => {
                    editorRef.current = codeEditor;

                    // Fold imports by default (only for java code, not bytecode)
                    if (decompileResult?.language === "java") {
                        console.log("Folding imports");
                        codeEditor.getAction('editor.foldAll')?.run();
                    }

                    // Update context key when cursor position changes
                    // We use this to know when to show the options to copy AW/Mixin strings
                    const isDefinitionContextKey = codeEditor.createContextKey<boolean>(IS_DEFINITION_CONTEXT_KEY_NAME, false);
                    codeEditor.onDidChangeCursorPosition((e) => {
                        const token = findTokenAtPosition(codeEditor, decompileResultRef.current, classListRef.current);
                        const validToken = token != null && (token.type == "class" || token.type == "method" || token.type == "field");
                        isDefinitionContextKey.set(validToken);
                    });

                    // Handle gutter clicks for line linking
                    codeEditor.onMouseDown((e) => {
                        if (e.target.type === editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
                            e.target.type === editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                            const lineNumber = e.target.position?.lineNumber;

                            const currentState = state.value;
                            if (lineNumber && currentState) {
                                // Shift-click to select a range
                                if (e.event.shiftKey && currentState.line) {
                                    setSelectedFile(currentState.file, currentState.line, lineNumber);
                                } else {
                                    setSelectedFile(currentState.file, lineNumber);
                                }
                            }
                        }
                    });
                }} />
        </Spin>
    );
};

export default Code;