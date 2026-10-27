import {
    editor,
    languages,
    type CancellationToken,
    type IDisposable,
} from "monaco-editor";
import { getTokenLocation, type Token } from "../logic/Tokens";
import { activeJavadocToken, getJavadocForToken, javadocRevision } from "./Javadoc";
import type { DecompileResult } from "../workers/decompile/types";
import { combineLatest } from "rxjs";

type monaco = typeof import("monaco-editor");

const EDIT_JAVADOC_COMMAND_ID = 'editor.action.editJavadoc';

export function applyJavadocCodeExtensions(monaco: monaco, editor: editor.IStandaloneCodeEditor, decompile: DecompileResult): IDisposable {
    const viewZoneIds: string[] = [];
    const refreshJavadocs = () => {
        editor.changeViewZones((accessor) => {
            viewZoneIds.forEach(id => accessor.removeZone(id));
            viewZoneIds.length = 0;

            decompile.tokens
                .filter(token => token.declaration)
                .forEach(token => {
                    const mdValue = getJavadocForToken(token);
                    if (mdValue == null || activeJavadocToken.value === token) {
                        return;
                    }

                    const domNode = document.createElement('div');
                    editor.applyFontInfo(domNode);
                    const lineStart = decompile.source.lastIndexOf("\n", token.start - 1) + 1;
                    const indentation = /^[\t ]*/.exec(decompile.source.slice(lineStart))![0];
                    const tabSize = editor.getModel()?.getOptions().tabSize ?? 4;
                    const lineCount = renderJavadoc(domNode, mdValue, indentation, tabSize);

                    const location = getTokenLocation(decompile, token);
                    const zoneId = accessor.addZone({
                        afterLineNumber: location.line - 1,
                        heightInLines: lineCount,
                        domNode: domNode
                    });

                    viewZoneIds.push(zoneId);
                });
        });
    };
    const javadocSubscription = combineLatest([javadocRevision, activeJavadocToken]).subscribe(refreshJavadocs);
    const modelChangeListener = editor.onDidChangeModel(refreshJavadocs);
    const configurationChangeListener = editor.onDidChangeConfiguration(event => {
        if (event.hasChanged(monaco.editor.EditorOption.fontInfo)) {
            refreshJavadocs();
        }
    });

    const codeLense = monaco.languages.registerCodeLensProvider("java", {
        provideCodeLenses: function(model: editor.ITextModel, token: CancellationToken): languages.ProviderResult<languages.CodeLensList> {
            const lenses: languages.CodeLens[] = [];

            for (const token of decompile.tokens) {
                if (!token.declaration || token.type == 'parameter' || token.type == 'local') {
                    continue;
                }

                const location = getTokenLocation(decompile, token);
                lenses.push({
                    range: {
                        startLineNumber: location.line,
                        startColumn: 0,
                        endLineNumber: location.line,
                        endColumn: 0,
                    },
                    command: {
                        id: EDIT_JAVADOC_COMMAND_ID,
                        title: "Edit Javadoc",
                        arguments: [token]
                    }
                });
            }

            return {
                lenses,
                dispose: () => { }
            };
        }
    });


    const editJavadocCommand = monaco.editor.addEditorAction({
        id: EDIT_JAVADOC_COMMAND_ID,
        label: 'Edit Javadoc',
        run: function(editor, ...args) {
            const token = args[0] as Token;
            activeJavadocToken.next(token);
        }
    });

    return {
        dispose() {
            editJavadocCommand.dispose();
            codeLense.dispose();
            modelChangeListener.dispose();
            configurationChangeListener.dispose();
            javadocSubscription.unsubscribe();
            editor.changeViewZones((accessor) => {
                viewZoneIds.forEach(id => accessor.removeZone(id));
            });
        }
    };
}

function renderJavadoc(domNode: HTMLDivElement, markdown: string, indentation: string, tabSize: number): number {
    const indent = indentation + "/// ";
    const lines = markdown.split("\n");

    domNode.style.color = "#6A9955";
    domNode.style.whiteSpace = "pre";
    domNode.style.tabSize = String(tabSize);
    domNode.textContent = lines.map(line => indent + line).join("\n");
    return lines.length;
}
