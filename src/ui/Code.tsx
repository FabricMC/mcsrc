import Editor, { useMonaco } from '@monaco-editor/react';
import { useObservable } from '../utils/UseObservable';
import { isDecompiling } from '../logic/Decompiler';
import { useEffect, useRef, useState } from 'react';
import { editor, Range } from "monaco-editor";
import { isThin } from '../logic/Browser';
import { classesList } from '../logic/JarFile';
import { activeTabKey, getOpenTab, openTabs, tabHistory } from '../logic/Tabs';
import { message, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { selectedFile, setSelectedFile, state } from '../logic/State';
import { pairwise, startWith } from "rxjs";
import { getNextJumpToken, nextUsageNavigation, usageQuery } from '../logic/FindUsages';
import { setupJavaBytecodeLanguage } from '../utils/JavaBytecode';
import { selectedInheritanceClassName } from '../logic/Inheritance';
import { createHoverProvider } from './CodeHoverProvider';
import {
    createCopyAwAction,
    createCopyMixinAction,
    createFindUsagesAction,
    createViewInheritanceAction,
    IS_DEFINITION_CONTEXT_KEY_NAME
} from './CodeContextActions';
import {
    createDefinitionProvider,
    createEditorOpener,
    createFoldingRangeProvider,
    getUriDecompilationResult
} from './CodeExtensions';
import { diffView } from '../logic/Diff';
import { bytecode, displayLambdas } from '../logic/Settings';
import { minecraftJar } from '../logic/MinecraftApi';
import { findTokenAtEditorPosition } from './CodeUtils';
import { getTokenLocation } from '../logic/Tokens';
import { IS_JAVADOC_EDITOR } from '../site';
import { applyJavadocCodeExtensions } from '../javadoc/JavadocCodeExtensions';
import { refreshJavadocDataForClass } from '../javadoc/Javadoc';

const Code = () => {
    const monaco = useMonaco();

    const jar = useObservable(minecraftJar);
    const className = useObservable(selectedFile);
    const classList = useObservable(classesList);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const hideMinimap = useObservable(isThin);
    const decompiling = useObservable(isDecompiling);
    const currentState = useObservable(state);
    const nextUsage = useObservable(nextUsageNavigation);

    const decorationsCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const lineHighlightRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const classListRef = useRef(classList);

    const [messageApi, contextHolder] = message.useMessage();

    const [resetViewTrigger, setResetViewTrigger] = useState(false);

    async function applyTokenDecorations(model: editor.ITextModel) {
        if (!jar) return;
        const result = await getUriDecompilationResult(jar, model.uri);

        // Reapply token decorations for the current tab
        if (editorRef.current && result.tokens) {
            const decorations = result.tokens.map(token => {
                const startPos = model.getPositionAt(token.start);
                const endPos = model.getPositionAt(token.start + token.length);
                const canGoTo = !token.declaration && classList && classList.includes(token.className + ".class");

                return {
                    range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
                    options: {
                        inlineClassName: token.type + '-token-decoration' + (canGoTo ? "-pointer" : "")
                    }
                };
            });

            decorationsCollectionRef.current?.clear();
            decorationsCollectionRef.current = editorRef.current.createDecorationsCollection(decorations);
        }
    }

    // Keep refs updated
    useEffect(() => {
        classListRef.current = classList;
    }, [classList]);

    useEffect(() => {
        if (!monaco) return;
        if (!jar) return;

        const definitionProvider = monaco.languages.registerDefinitionProvider(
            "java",
            createDefinitionProvider(jar, classListRef)
        );

        const hoverProvider = monaco.languages.registerHoverProvider(
            "java",
            createHoverProvider(jar, classListRef)
        );

        const editorOpener = monaco.editor.registerEditorOpener(
            createEditorOpener(jar)
        );

        const foldingRange = monaco.languages.registerFoldingRangeProvider(
            "java",
            createFoldingRangeProvider(monaco)
        );

        const copyAw = monaco.editor.addEditorAction(
            createCopyAwAction(jar, classListRef, messageApi)
        );

        const copyMixin = monaco.editor.addEditorAction(
            createCopyMixinAction(jar, classListRef, messageApi)
        );

        const viewUsages = monaco.editor.addEditorAction(
            createFindUsagesAction(jar, classListRef, messageApi, (value) => usageQuery.next(value))
        );

        const viewInheritance = monaco.editor.addEditorAction(
            createViewInheritanceAction(jar, messageApi, (value) => selectedInheritanceClassName.next(value))
        );

        const bytecode = setupJavaBytecodeLanguage(monaco);

        return () => {
            // Dispose in the oppsite order
            bytecode.dispose();
            viewInheritance.dispose();
            viewUsages.dispose();
            copyMixin.dispose();
            copyAw.dispose();
            foldingRange.dispose();
            editorOpener.dispose();
            hoverProvider.dispose();
            definitionProvider.dispose();
        };
    }, [monaco, jar, classList, resetViewTrigger]);

    if (IS_JAVADOC_EDITOR) {
        useEffect(() => {
            if (!monaco || !editorRef.current || !jar) return;

            const extensions = applyJavadocCodeExtensions(monaco, editorRef.current, jar);

            return () => {
                extensions.dispose();
            };
        }, [monaco, editorRef.current, jar, className]);

        useEffect(() => {
            if (!className) return;

            refreshJavadocDataForClass(className.replace(".class", "")).catch(err => {
                console.error("Failed to refresh Javadoc data for class:", err);
            });
        }, [className]);
    }

    // Scroll to top when source changes, or to specific line if specified
    useEffect(() => {
        if (editorRef.current && jar) {
            const editor = editorRef.current;
            const currentTab = openTabs.value.find(tab => tab.key === activeTabKey.value);
            const prevTab = openTabs.value.find(tab => tab.key === tabHistory.value.at(-2));
            if (prevTab) {
                prevTab.scroll = editor.getScrollTop();
            }

            lineHighlightRef.current?.clear();

            const executeScroll = () => {
                const currentLine = state.value?.line;
                if (currentLine) {
                    const lineEnd = state.value?.lineEnd ?? currentLine;
                    editor.setSelection(new Range(currentLine, 1, currentLine, 1));
                    editor.revealLinesInCenterIfOutsideViewport(currentLine, lineEnd);

                    // Highlight the line range
                    lineHighlightRef.current = editor.createDecorationsCollection([{
                        range: new Range(currentLine, 1, lineEnd, 1),
                        options: {
                            isWholeLine: true,
                            className: 'highlighted-line',
                            glyphMarginClassName: 'highlighted-line-glyph'
                        }
                    }]);
                } else if (currentTab && currentTab.scroll > 0) {
                    editor.setScrollTop(currentTab.scroll);
                } else {
                    editor.setScrollTop(0);
                }
            };

            // Use requestAnimationFrame to ensure Monaco has finished layout
            requestAnimationFrame(() => {
                executeScroll();
            });
        }
    }, [jar, currentState?.line, currentState?.lineEnd]);

    // Scroll to a "Find usages" token
    useEffect(() => {
        (async () => {
            if (editorRef.current && jar) {
                const model = editorRef.current.getModel();
                if (!model) return;

                const result = await getUriDecompilationResult(jar, model.uri);
                if (result.language !== "java") return;

                const editor = editorRef.current;

                lineHighlightRef.current?.clear();

                const executeScroll = () => {
                    const nextJumpToken = getNextJumpToken(result);
                    const nextJumpLocation = nextJumpToken && getTokenLocation(result, nextJumpToken);

                    if (nextJumpLocation) {
                        const { line, column, length } = nextJumpLocation;
                        editor.revealLinesInCenterIfOutsideViewport(line, line);
                        editor.setSelection(new Range(line, column, line, column + length));
                    }
                };

                requestAnimationFrame(() => {
                    executeScroll();
                });
            }
        })();
    }, [jar, className, nextUsage]);

    // Subscribe to tab changes and store model & viewstate of previously opened tab
    useEffect(() => {
        const sub = activeTabKey.pipe(
            startWith(activeTabKey.value),
            pairwise()
        ).subscribe(([prev, curr]) => {
            if (prev === curr) return;

            const previousTab = openTabs.getValue().find(o => o.key === prev);
            previousTab?.cacheView(
                editorRef.current?.saveViewState() || null,
                editorRef.current?.getModel() || null
            );
        });

        // Cache if diffview is opened and restore if it is closed;
        const sub2 = diffView.subscribe((open) => {
            const openTab = getOpenTab();
            if (open) {
                openTab?.cacheView(
                    editorRef.current?.saveViewState() || null,
                    editorRef.current?.getModel() || null
                );
            } else {
                if (!openTab) return;
                setSelectedFile(openTab.key);

                // While this is not perfect, it works because leaving the diff view
                // makes the view invisible and doesn't apply any of the custom "extensions",
                // manually forcing a rerender works ^-^
                setTimeout(() => {
                    setResetViewTrigger(!resetViewTrigger);
                }, 100);
            }
        });

        return () => {
            sub.unsubscribe();
            sub2.unsubscribe();
        };
    }, [jar, className]);

    // Handles setting the model and viewstate of the editor
    useEffect(() => {
        if (diffView.value) return;
        if (!monaco || !jar) return;

        const tab = getOpenTab();
        if (!tab) return;
        const lang = bytecode.value ? "bytecode" : "java";

        let query = "";
        if (bytecode.value) query += "&bytecode=true";
        if (displayLambdas.value) query += "&lambas=true";

        // FIXME: version is in the fragment for now, but is not used apart from model differentiation.
        //        should the URI be used to actually fetch the jar, so we don't have to pass the JAR
        //        around everywhere? probably.
        const uri = monaco.Uri.from({ scheme: "mcsrc", path: `${className}`, query, fragment: jar.version });

        (async () => {
            if (!tab.model || tab.model?.uri?.toString() !== uri.toString()) {
                // Create new model with the current decompilation source
                const result = await getUriDecompilationResult(jar, uri);
                let model = monaco.editor.createModel(result.source, lang, uri);

                tab.invalidateCachedView();
                tab.model = model;
            }

            if (editorRef.current) tab.applyViewToEditor(editorRef.current);
            applyTokenDecorations(tab.model!);
        })();
    }, [className, jar, resetViewTrigger]);

    return (
        <Spin
            indicator={<LoadingOutlined spin />}
            size={"large"}
            spinning={!!decompiling}
            tip="Decompiling..."
            style={{
                height: '100%',
                color: 'white'
            }}
        >
            {contextHolder}
            <Editor
                height="100vh"
                theme="vs-dark"
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    tabSize: 3,
                    minimap: { enabled: !hideMinimap },
                    glyphMargin: true,
                    foldingImportsByDefault: true,
                    foldingHighlight: false
                }}
                onMount={(codeEditor) => {
                    editorRef.current = codeEditor;

                    // Update context key when cursor position changes
                    // We use this to know when to show the options to copy AW/Mixin strings
                    const isDefinitionContextKey = codeEditor.createContextKey<boolean>(IS_DEFINITION_CONTEXT_KEY_NAME, false);
                    codeEditor.onDidChangeCursorPosition(async (e) => {
                        const model = codeEditor.getModel();
                        if (!jar || !model) return;

                        const result = await getUriDecompilationResult(jar, model.uri);
                        const token = findTokenAtEditorPosition(result, codeEditor, classListRef.current);
                        const validToken = token != null && (token.type == "class" || token.type == "method" || token.type == "field");
                        isDefinitionContextKey.set(validToken);
                    });

                    // Handle gutter clicks for line linking
                    codeEditor.onMouseDown((e) => {
                        if (e.target.type === editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
                            e.target.type === editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                            const lineNumber = e.target.position?.lineNumber;

                            const currentState = state.value;
                            if (lineNumber && currentState) {
                                // Shift-click to select a range
                                if (e.event.shiftKey && currentState.line) {
                                    setSelectedFile(currentState.file, currentState.line, lineNumber);
                                } else {
                                    setSelectedFile(currentState.file, lineNumber);
                                }
                            }
                        }
                    });
                }} />
        </Spin>
    );
};

export default Code;
