import { editor } from "monaco-editor";
import { type Token } from '../logic/Tokens';

export function findTokenAtEditorPosition(
    decompileResult: { tokens: Token[]; } | undefined,
    editor: editor.ICodeEditor,
    classList: string[] | undefined,
    useClassList = true
): Token | null {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) {
        return null;
    }

    return findTokenAt(decompileResult, model.getOffsetAt(position), classList, useClassList);
}

export function findTokenAt(
    decompileResult: { tokens: Token[]; } | undefined,
    offset: number,
    classList: string[] | undefined,
    useClassList = true
): Token | null {
    if (!decompileResult || (useClassList && !classList)) {
        return null;
    }

    for (const token of decompileResult.tokens) {
        if (offset >= token.start && offset <= token.start + token.length) {
            const baseClassName = token.className.split('$')[0];
            const className = baseClassName + ".class";
            if (!useClassList || classList!.includes(className)) {
                return token;
            }
        }

        if (token.start > offset) {
            break;
        }
    }

    return null;
}
