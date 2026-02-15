import { editor, languages, Position, Token, type CancellationToken } from "monaco-editor";

import type { MemberToken } from "../logic/Tokens";
import type { DecompileResult } from "../workers/decompile/types";

export class JavdocCompletionProvider implements languages.CompletionItemProvider {
  readonly decompileResult: DecompileResult;

  constructor(decompileResult: DecompileResult) {
    this.decompileResult = decompileResult;
  }

  triggerCharacters: string[] = ["[", "#"];

  provideCompletionItems(
    model: editor.ITextModel,
    position: Position,
    context: languages.CompletionContext,
    token: CancellationToken,
  ): languages.ProviderResult<languages.CompletionList> {
    if (!this.isCreatingLink(model, position)) {
      return { suggestions: [] };
    }

    const range = {
      startLineNumber: position.lineNumber,
      startColumn: position.column,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    };

    if (this.isCreatingMemberLink(model, position)) {
      const suggestions: languages.CompletionItem[] = this.getMembers().map((token) => {
        return {
          label: token.name,
          kind:
            token.type === "method"
              ? languages.CompletionItemKind.Method
              : languages.CompletionItemKind.Field,
          insertText: token.name,
          range,
        };
      });

      return { suggestions };
    }

    const imports = this.getImportedClasses();

    const suggestions: languages.CompletionItem[] = imports.map((importPath) => {
      const className = importPath.split(".").pop() || importPath;

      return {
        label: className,
        kind: languages.CompletionItemKind.Reference,
        insertText: className,
        detail: importPath,
        range,
      };
    });

    return { suggestions };
  }

  isCreatingLink(model: editor.ITextModel, position: Position): boolean {
    // Check if cursor is within [] characters
    const lineContent = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineContent.substring(0, position.column - 1);
    const textAfterCursor = lineContent.substring(position.column - 1);

    // Find the last '[' before cursor and first ']' after cursor
    const lastOpenBracket = textBeforeCursor.lastIndexOf("[");
    const firstCloseBracket = textAfterCursor.indexOf("]");

    // Only provide completions if we're inside brackets
    return lastOpenBracket !== -1 && firstCloseBracket !== -1;
  }

  isCreatingMemberLink(model: editor.ITextModel, position: Position): boolean {
    const lineContent = model.getLineContent(position.lineNumber);
    const textBeforeCursor = lineContent.substring(0, position.column - 1);
    const lastOpenBracket = textBeforeCursor.lastIndexOf("[");
    const textAfterBracket = textBeforeCursor.substring(lastOpenBracket + 1);
    return textAfterBracket.startsWith("#");
  }

  getImportedClasses(): string[] {
    const source = this.decompileResult.source;
    const importedClasses: string[] = [];

    const importRegex = /^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm;

    let match = null;
    while ((match = importRegex.exec(source)) !== null) {
      const importPath = match[1];
      if (importPath.endsWith("*")) {
        continue;
      }

      importedClasses.push(importPath);
    }

    return importedClasses;
  }

  getMembers(): MemberToken[] {
    const tokens = this.decompileResult.tokens;
    const members: MemberToken[] = [];

    for (const token of tokens) {
      if (token.declaration && (token.type == "method" || token.type == "field")) {
        members.push(token);
      }
    }

    return members;
  }
}
