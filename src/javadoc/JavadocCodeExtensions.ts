import {
    editor,
    languages,
    type CancellationToken,
    type IDisposable,
} from "monaco-editor";
import { getTokenLocation, type Token } from "../logic/Tokens";
import { activeJavadocToken, getJavadocForToken, javadocRevision } from "./Javadoc";
import type { DecompileResult } from "../workers/decompile/types";
import { combineLatest, EMPTY, from, startWith, Subject, switchMap, tap } from "rxjs";
import { jarIndex, type JarIndex } from "../workers/jar-index/client";
import { isDarkMode } from "../logic/Browser";
import { JavadocSymbols } from "./editor/JavadocSymbols";
import { createJavadocView, createRawJavadocView } from "./JavadocView";
import type { ClassName } from "../utils/Names";
import { renderJavadoc } from "../logic/Settings";

type monaco = typeof import("monaco-editor");

const EDIT_JAVADOC_COMMAND_ID = 'editor.action.editJavadoc';

export function applyJavadocCodeExtensions(monaco: monaco, editor: editor.IStandaloneCodeEditor, decompile: DecompileResult): IDisposable {
    const views: IDisposable[] = [];
    const symbols = new Map<ClassName, JavadocSymbols>();
    let index: JarIndex | undefined;
    const symbolsFor = (owner: ClassName) => {
        let result = symbols.get(owner);
        if (!result) {
            result = new JavadocSymbols(decompile, owner, index);
            symbols.set(owner, result);
        }
        return result;
    };
    const refreshJavadocs = new Subject<void>();
    const javadocSubscription = combineLatest([
        javadocRevision, activeJavadocToken, jarIndex, isDarkMode, renderJavadoc.observable,
        refreshJavadocs.pipe(startWith(undefined)),
    ]).pipe(
        switchMap(([, , nextIndex, , renderMarkdown]) => {
            for (const view of views) {
                view.dispose();
            }
            views.length = 0;
            if (index !== nextIndex) {
                index = nextIndex;
                symbols.clear();
            }
            if (editor.getModel()?.getValue() !== decompile.source) return EMPTY;

            const documentation = decompile.tokens
                .filter(token => token.declaration && token !== activeJavadocToken.value)
                .map(token => ({ token, markdown: getJavadocForToken(token) }))
                .filter(entry => entry.markdown !== null);
            if (!renderMarkdown) {
                for (const { token, markdown } of documentation) {
                    views.push(createRawJavadocView(editor, decompile, token, markdown!));
                }
                return EMPTY;
            }
            return from(Promise.all(documentation.map(({ token }) => symbolsFor(token.className).ready))).pipe(
                tap(() => {
                    for (const { token, markdown } of documentation) {
                        views.push(createJavadocView(monaco, editor, decompile, token, markdown!, symbolsFor(token.className)));
                    }
                }),
            );
        }),
    ).subscribe();
    const modelChangeListener = editor.onDidChangeModel(() => refreshJavadocs.next());
    const configurationChangeListener = editor.onDidChangeConfiguration(event => {
        if (event.hasChanged(monaco.editor.EditorOption.fontInfo)) {
            refreshJavadocs.next();
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
            refreshJavadocs.complete();
            for (const view of views) {
                view.dispose();
            }
        }
    };
}
