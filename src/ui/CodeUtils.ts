import { editor } from "monaco-editor";

import { type Token } from "../logic/Tokens";

export function findTokenAtPosition(
  editor: editor.ICodeEditor,
  decompileResult: { tokens: Token[] } | undefined,
  classList: string[] | undefined,
  useClassList = true,
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
      const baseClassName = token.className.split("$")[0];
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
