import type { editor } from "monaco-editor";
import { expect, it, vi } from "vitest";
import { unpickCompletionProvider } from "./UnpickCompletionProvider";
import { unpickSymbolCompletionProvider } from "./UnpickSymbolCompletionProvider";

vi.mock("monaco-editor", () => ({
    languages: {
        CompletionItemKind: { Keyword: 17, Snippet: 27, Variable: 4 },
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
}));

function editorAtEnd(value: string) {
    const lines = value.split("\n");
    const model = {
        getValue: () => value,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
        isDisposed: () => false,
    } as editor.ITextModel;
    const position = { lineNumber: lines.length, column: lines.at(-1)!.length + 1 };
    return { model, position };
}

function complete(value: string) {
    const { model, position } = editorAtEnd(value);
    return unpickCompletionProvider.provideCompletionItems(model, position).suggestions;
}

it("offers declarations as snippets that replace the typed prefix", () => {
    expect(complete("unpick v4\ntarget_")).toContainEqual(expect.objectContaining({
        label: "target_method",
        insertText: expect.stringContaining("\n\tparam "),
        range: { startLineNumber: 2, endLineNumber: 2, startColumn: 1, endColumn: 8 },
    }));
});

it.each([
    ["group ", "Class"],
    ["group int flags\n    @", "@flags"],
    ["group int flags\ntarget_method example.Owner method (I)V\n    param 0 ", "flags"],
])("offers context-specific completions for %s", (value, label) => {
    expect(complete(`unpick v4\n${value}`).map(item => item.label)).toContain(label);
});

it("does not offer group attributes inside a target method", () => {
    expect(complete("unpick v4\ngroup int flags\ntarget_method example.Owner method (I)V\n    @")).toEqual([]);
});

it("suggests the indexes of the target overload with names where available", async () => {
    const { model, position } = editorAtEnd("unpick v4\ntarget_method example.Owner method (II)V\n    param ");
    const provider = unpickSymbolCompletionProvider(model, {
        classes: async () => new Set(),
        currentClass: () => undefined,
        members: async () => [
            { kind: "method", name: "method", descriptor: "(I)V", isStatic: false, parameterNames: ["other"] },
            { kind: "method", name: "method", descriptor: "(II)V", isStatic: false, parameterNames: ["flags", null] },
        ],
    });
    const { suggestions } = await provider.provideCompletionItems(model, position, { triggerKind: 0 }, {
        isCancellationRequested: false,
        onCancellationRequested: () => ({ dispose: () => undefined }),
    });
    expect(suggestions.map(({ label, insertText }) => ({ label, insertText }))).toEqual([
        { label: { label: "0", description: "flags · int" }, insertText: "0 " },
        { label: { label: "1", description: "int" }, insertText: "1 " },
    ]);
});
