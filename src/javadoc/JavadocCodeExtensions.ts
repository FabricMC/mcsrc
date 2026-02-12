import {
    editor,
    languages,
    type CancellationToken,
    type IDisposable,
} from "monaco-editor";
import { getTokenLocation, type Token, type TokenLocation } from "../logic/Tokens";
import { activeJavadocToken, getJavadocForToken, javadocData, refreshJavadocDataForClass, type JavadocData, type JavadocString } from "./Javadoc";
import type { DecompileResult } from "../workers/decompile/types";

type monaco = typeof import("monaco-editor");

const EDIT_JAVADOC_COMMAND_ID = 'editor.action.editJavadoc';

export function applyJavadocCodeExtensions(monaco: monaco, editor: editor.IStandaloneCodeEditor, decompile: DecompileResult): IDisposable {
    const viewZoneIds: string[] = [];
    const javadocDataSub = javadocData.subscribe((javadoc) => {
        editor.changeViewZones((accessor) => {
            // Remove any existing zones
            viewZoneIds.forEach(id => accessor.removeZone(id));
            viewZoneIds.length = 0;

            decompile.tokens
                .filter(token => token.declaration)
                .forEach(token => {
                    const mdValue = getJavadocForToken(token, javadoc);
                    if (mdValue == null) {
                        return;
                    }

                    const domNode = document.createElement('div');
                    domNode.innerHTML = `<span style="color: #6A9955;">${formatMarkdownAsHtml(mdValue, token)}</span>`;

                    const location = getTokenLocation(decompile, token);
                    const zoneId = accessor.addZone({
                        afterLineNumber: location.line - 1,
                        heightInPx: cacluateHeightInPx(domNode),
                        domNode: domNode
                    });

                    viewZoneIds.push(zoneId);
                });
        });
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

    refreshJavadocDataForClass(decompile.className.replace(".class", "")).catch(err => {
        console.error("Failed to refresh Javadoc data for class:", err);
    });

    return {
        dispose() {
            editJavadocCommand.dispose();
            codeLense.dispose();

            javadocDataSub.unsubscribe();
            editor.changeViewZones((accessor) => {
                viewZoneIds.forEach(id => accessor.removeZone(id));
            });
        }
    };
}

function formatMarkdownAsHtml(md: string, token: Token): string {
    // TODO maybe use a proper markdown parser/renderer here

    const nestingLevel = (token.className.match(/\$/g) || []).length + (token.type == 'method' || token.type == 'field' ? 1 : 0);
    const depth = nestingLevel * 6;

    const indent = "&nbsp;".repeat(depth) + "/// ";
    return md.split("\n").map(line => indent + line).join("<br>");
}


function cacluateHeightInPx(domNode: HTMLDivElement): number {
    domNode.style.position = 'absolute';
    domNode.style.visibility = 'hidden';
    document.body.appendChild(domNode);
    const heightInPx = domNode.offsetHeight * 1.2; // Magic number seems to fix it
    document.body.removeChild(domNode);
    domNode.style.position = '';
    domNode.style.visibility = '';

    return heightInPx;
}
