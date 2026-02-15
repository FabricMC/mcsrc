import type { CancellationToken, IPosition, IRange, languages } from "monaco-editor";

import { editor, Range, Uri } from "monaco-editor";
import { BehaviorSubject } from "rxjs";

import type { DecompileResult } from "../workers/decompile/types";

import { selectedFile } from "../logic/State";
import { openTab } from "../logic/Tabs";
import { getTokenLocation } from "../logic/Tokens";

export type TokenJumpTarget = {
  className: string;
  targetType: "method" | "field" | "class";
  target: string;
};

export const pendingTokenJump = new BehaviorSubject<TokenJumpTarget | null>(null);

export function requestTokenJump(
  className: string,
  targetType: "method" | "field" | "class",
  target: string,
) {
  pendingTokenJump.next({ className, targetType, target });
}

export function clearTokenJump() {
  pendingTokenJump.next(null);
}

export function jumpToToken(
  result: DecompileResult,
  targetType: "method" | "field" | "class",
  target: string,
  editor: editor.ICodeEditor,
) {
  for (const token of result.tokens) {
    if (!(token.declaration && token.type == targetType)) continue;

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

    const { line, column } = getTokenLocation(result, token);
    editor.setSelection(new Range(line, column, line, column + token.length));
    editor.revealLineInCenter(line, 0);
    break;
  }

  console.warn(`jumpToToken: Target ${targetType} "${target}" not found in ${result.className}`);
}

export function createDefinitionProvider(
  decompileResultRef: { current: DecompileResult | undefined },
  classListRef: { current: string[] | undefined },
) {
  return {
    provideDefinition(model: editor.ITextModel, position: IPosition, token: CancellationToken) {
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
          const className = token.className + ".class";
          const baseClassName = token.className.split("$")[0] + ".class";
          console.log(`Found token for definition: ${className} at offset ${token.start}`);

          if (classList && (classList.includes(className) || classList.includes(baseClassName))) {
            const targetClass = className;
            const range = new Range(lineNumber, column, lineNumber, column + token.length);

            return {
              uri:
                "descriptor" in token
                  ? Uri.parse(
                      `goto://class/${className}#${token.type}:${
                        token.type === "method" ? `${token.name}:${token.descriptor}` : token.name
                      }`,
                    )
                  : Uri.parse(`goto://class/${className}`),
              range,
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

export function createEditorOpener(decompileResultRef: { current: DecompileResult | undefined }) {
  return {
    openCodeEditor: function (
      editor: editor.ICodeEditor,
      resource: Uri,
      selectionOrPosition?: IRange | IPosition,
    ): boolean {
      if (!resource.scheme.startsWith("goto")) {
        return false;
      }

      const className = resource.path.substring(1);
      const baseClassName = className.includes("$")
        ? className.split("$")[0] + ".class"
        : className;

      const jumpInSameFile = baseClassName === selectedFile.value;
      const fragment = resource.fragment.split(":") as [string, ...string[]];

      if (fragment.length >= 2) {
        const targetType = fragment[0] as "method" | "field";

        if (targetType === "method" && fragment.length === 3) {
          // Format: method:methodName:descriptor
          const [_, methodName, descriptor] = fragment;
          const target = `${methodName}:${descriptor}`;
          requestTokenJump(baseClassName, targetType, target);
          if (!jumpInSameFile) {
            openTab(baseClassName);
          }
        } else if (targetType === "field" && fragment.length === 2) {
          // Format: field:fieldName
          const target = fragment[1];
          requestTokenJump(baseClassName, targetType, target);
          if (!jumpInSameFile) {
            openTab(baseClassName);
          }
        }
      } else if (baseClassName != className) {
        // Handle inner class navigation
        const innerClassName = className.replace(".class", "");
        // Always use the queue, even for same-file jumps
        requestTokenJump(baseClassName, "class", innerClassName);
        if (!jumpInSameFile) {
          openTab(baseClassName);
        }
      } else {
        openTab(baseClassName);
      }
      return true;
    },
  };
}

export function createFoldingRangeProvider(monaco: any) {
  function getImportFoldingRanges(lines: string[]) {
    let packageLine: number | null = null;
    let firstImportLine: number | null = null;
    let lastImportLine: number | null = null;

    for (let i = 0; i < lines.length; i++) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.startsWith("package ")) {
        packageLine = i + 1;
      } else if (trimmedLine.startsWith("import ")) {
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
      return [
        {
          start: packageLine,
          end: lastImportLine,
          kind: monaco.languages.FoldingRangeKind.Imports,
        },
      ];
    } else if (
      firstImportLine !== null &&
      lastImportLine !== null &&
      firstImportLine < lastImportLine
    ) {
      // Fallback if no package line exists
      return [
        {
          start: firstImportLine,
          end: lastImportLine,
          kind: monaco.languages.FoldingRangeKind.Imports,
        },
      ];
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
    provideFoldingRanges: function (
      model: editor.ITextModel,
      context: languages.FoldingContext,
      token: CancellationToken,
    ): languages.ProviderResult<languages.FoldingRange[]> {
      const lines = model.getLinesContent();
      return [...getImportFoldingRanges(lines), ...getBracketFoldingRanges(lines)];
    },
  };
}
