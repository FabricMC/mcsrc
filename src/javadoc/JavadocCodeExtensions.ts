import {
    editor,
    languages,
    type CancellationToken,
    type IDisposable,
} from "monaco-editor";
import { getTokenLocation, type Token, type TokenLocation } from "../logic/Tokens";
import { activeJavadocToken, getJavadocForToken, javadocData, refreshJavadocDataForClass, type JavadocData, type JavadocString } from "./Javadoc";
import type { MinecraftJar } from "../logic/MinecraftApi";
import { getUriDecompilationResult } from "../ui/CodeExtensions";

type monaco = typeof import("monaco-editor");

const EDIT_JAVADOC_COMMAND_ID = 'editor.action.editJavadoc';

export function applyJavadocCodeExtensions(monaco: monaco, editor: editor.IStandaloneCodeEditor, jar: MinecraftJar): IDisposable {
    const viewZoneIds: string[] = [];
    const javadocDataSub = javadocData.subscribe((javadoc) => {
        editor.changeViewZones(async (accessor) => {
            // Remove any existing zones
            viewZoneIds.forEach(id => accessor.removeZone(id));
            viewZoneIds.length = 0;

            const model = editor.getModel();
            if (!model) return;
            const result = await getUriDecompilationResult(jar, model.uri);

            result.tokens
                .filter(token => token.declaration)
                .forEach(token => {
                    const mdValue = getJavadocForToken(token, javadoc);
                    if (mdValue == null) {
                        return;
                    }

                    const domNode = document.createElement('div');
                    domNode.innerHTML = `<span style="color: #6A9955;">${formatMarkdownAsHtml(mdValue, token)}</span>`;

                    const location = getTokenLocation(result, token);
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
        provideCodeLenses: async function (model: editor.ITextModel, token: CancellationToken): Promise<languages.CodeLensList> {
            const result = await getUriDecompilationResult(jar, model.uri);

            const lenses: languages.CodeLens[] = [];

            for (const token of result.tokens) {
                if (!token.declaration || token.type == 'parameter' || token.type == 'local') {
                    continue;
                }

                const location = getTokenLocation(result, token);
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
        run: function (editor, ...args) {
            const token: Token = args[0];
            activeJavadocToken.next(token);
        }
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