import { editor, type IMarkdownString, type IPosition, Range } from "monaco-editor";
import { type Token } from '../logic/Tokens';
import { findTokenAtPosition } from './CodeUtils';
import type { DecompileResult } from "../workers/decompile/types";

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

export function parseDescriptor(descriptor: string): string {
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

export function createHoverProvider(
    editorRef: { current: editor.ICodeEditor | null },
    decompileResultRef: { current: DecompileResult | undefined },
    classListRef: { current: string[] | undefined }
) {
    return {
        provideHover(model: editor.ITextModel, position: IPosition) {
            const token = findTokenAtPosition(editorRef.current!, decompileResultRef.current, classListRef.current, false);

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
                    case 'local':
                        return null;
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
    };
}
