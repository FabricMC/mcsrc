import { languages, type editor, type IPosition } from "monaco-editor";

const declarationSnippets = {
    group: "group ${1:int} ${2:name}\n\t$0",
    target_method: "target_method ${1:example.Owner} ${2:method} ${3:(I)V}\n\tparam ${4:0} ${5:group}$0",
    target_field: "target_field ${1:example.Owner} ${2:field} ${3:I} ${4:group}$0",
    target_annotation: "target_annotation ${1:example.Annotation} ${2:group}$0",
};

const groupTypes = ["int", "long", "float", "double", "String", "Class"];
const groupAttributes = ["@scope", "@format", "@flags", "@strict"];

export function blockHeader(model: editor.ITextModel, lineNumber: number): string {
    for (let line = lineNumber - 1; line > 1; line--) {
        const text = model.getLineContent(line);
        if (/^[^ \t#]/.test(text)) return text;
    }
    return "";
}

export const unpickCompletionProvider = {
    triggerCharacters: ["@", " "],

    provideCompletionItems(model, position: IPosition) {
        const { lineNumber, column } = position;
        const beforeCursor = model.getLineContent(lineNumber).slice(0, column - 1);
        const prefix = beforeCursor.match(/@?[\w$]*$/)?.[0] ?? "";
        const range = {
            startLineNumber: lineNumber,
            endLineNumber: lineNumber,
            startColumn: column - prefix.length,
            endColumn: column,
        };

        if (lineNumber === 1) return { suggestions: [] };

        if (/^[a-z_]*$/.test(beforeCursor)) {
            return {
                suggestions: Object.entries(declarationSnippets).map(([label, insertText]) => ({
                    label,
                    insertText,
                    kind: languages.CompletionItemKind.Snippet,
                    insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range,
                })),
            };
        }

        let labels: string[] = [];
        if (/^group[ \t]+[a-zA-Z]*$/.test(beforeCursor)) {
            labels = groupTypes;
        } else if (/^[ \t]+@[a-z]*$/.test(beforeCursor) && /^group[ \t]/.test(blockHeader(model, lineNumber))) {
            labels = groupAttributes;
        } else if (/^[ \t]+(?:param[ \t]+\d+|return)[ \t]+[\w$]*$/.test(beforeCursor)
                && /^target_method[ \t]/.test(blockHeader(model, lineNumber))) {
            const groups = model.getValue().matchAll(/^group[ \t]+\w+[ \t]+([a-zA-Z_$][\w$]*)(?=[ \t#\r\n]|$)/gm);
            labels = [...new Set(Array.from(groups, group => group[1]))];
        }

        return {
            suggestions: labels.map(label => ({ label, insertText: label, kind: languages.CompletionItemKind.Keyword, range })),
        };
    },
} satisfies languages.CompletionItemProvider;
