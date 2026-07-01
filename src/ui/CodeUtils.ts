import { editor } from "monaco-editor";
import { type Token } from '../logic/Tokens';
import { toClassFilePath, type ClassFilePath } from "../utils/Names";

export type DefinitionType = "generic" | "minecraft";

function getTargetOffset(editor: editor.ICodeEditor): number | null {
    const model = editor.getModel();
    if (!model) {
        return null;
    }

    const position = editor.getPosition();
    if (!position) {
        return null;
    }

    const { lineNumber, column } = position;
    const lines = model.getLinesContent();
    let charCount = 0;

    for (let i = 0; i < lineNumber - 1; i++) {
        charCount += lines[i].length + 1; // +1 for \n
    }
    return charCount + (column - 1);
}

export function findTokenAtPosition(
    editor: editor.ICodeEditor,
    decompileResult: { tokens: Token[]; } | undefined,
    classList: ClassFilePath[] | undefined,
    useClassList = true
): Token | null {
    if (!decompileResult || (useClassList && !classList)) {
        return null;
    }
    const targetOffset = getTargetOffset(editor);
    if (!targetOffset) {
        return null;
    }

    for (const token of decompileResult.tokens) {
        if (targetOffset >= token.start && targetOffset <= token.start + token.length) {
            const className = toClassFilePath(token.className.split('$')[0]);
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

export function isDefinitionAtPosition(
    editor: editor.ICodeEditor,
    decompileResult: { tokens: Token[]; },
    classList: ClassFilePath[]
): DefinitionType | null {
    const targetOffset = getTargetOffset(editor);
    if (!targetOffset) {
        return null;
    }

    let found: boolean = false;

    for (const token of decompileResult.tokens) {
        if (token.start > targetOffset) {
            break;
        }

        const isDef = token.type == "class" || token.type == "method" || token.type == "field";
        if (isDef && targetOffset <= token.start + token.length) {
            found = true;
            const className = toClassFilePath(token.className.split('$')[0]);
            if (classList.includes(className)) {
                return "minecraft";
            }
        }
    }

    return found ? "generic" : null;
}

