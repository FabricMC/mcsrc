import Editor, { useMonaco } from '@monaco-editor/react';
import { useObservable } from '../utils/UseObservable';
import { currentResult, type DecompileResult, isDecompiling } from '../logic/Decompiler';
import { useEffect, useRef, useState } from 'react';
import { editor, Range } from "monaco-editor";
import { isThin } from '../logic/Browser';
import { classesList } from '../logic/JarFile';
import { activeTabKey, getOpenTab, openTabs, tabHistory } from '../logic/Tabs';
import { message, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { setSelectedFile, state } from '../logic/State';
import { getTokenLocation } from '../logic/Tokens';
import { pairwise, startWith } from "rxjs";
import { getNextJumpToken, nextUsageNavigation, usageQuery } from '../logic/FindUsages';
import { setupJavaBytecodeLanguage } from '../utils/JavaBytecode';
import { IS_JAVADOC_EDITOR } from '../site';
import { applyJavadocCodeExtensions } from '../javadoc/JavadocCodeExtensions';
import { selectedInheritanceClassName } from '../logic/Inheritance';
import { createHoverProvider } from './CodeHoverProvider';
import { findTokenAtPosition } from './CodeUtils';
import {
    IS_DEFINITION_CONTEXT_KEY_NAME,
    createCopyAwAction,
    createCopyMixinAction,
    createFindUsagesAction,
    createViewInheritanceAction
} from './CodeContextActions';
import {
    createDefinitionProvider,
    createEditorOpener,
    createFoldingRangeProvider
} from './CodeExtensions';
import { diffView } from '../logic/Diff';
import { bytecode } from '../logic/Settings';

const Code = () => {
    const monaco = useMonaco();

    const decompileResult = useObservable(currentResult);
    const classList = useObservable(classesList);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const hideMinimap = useObservable(isThin);
    const decompiling = useObservable(isDecompiling);
    const currentState = useObservable(state);
    const nextUsage = useObservable(nextUsageNavigation);

    const decorationsCollectionRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const lineHighlightRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const decompileResultRef = useRef(decompileResult);
    const classListRef = useRef(classList);

    const [messageApi, contextHolder] = message.useMessage();

    const [resetViewTrigger, setResetViewTrigger] = useState(false);

    function applyTokenDecorations(model: editor.ITextModel) {
        if (!decompileResult) return;

        // Reapply token decorations for the current tab
        if (editorRef.current && decompileResult.tokens) {
            const decorations = decompileResult.tokens.map(token => {
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
        decompileResultRef.current = decompileResult;
        classListRef.current = classList;
    }, [decompileResult, classList]);

    useEffect(() => {
        if (!monaco) return;
        if (!editorRef.current) return;
        const editor = editorRef.current;

        const definitionProvider = monaco.languages.registerDefinitionProvider(
            "java",
            createDefinitionProvider(decompileResultRef, classListRef)
        );

        const hoverProvider = monaco.languages.registerHoverProvider(
            "java",
            createHoverProvider(editorRef, decompileResultRef, classListRef)
        );

        const editorOpener = monaco.editor.registerEditorOpener(
            createEditorOpener(decompileResultRef)
        );

        const foldingRange = monaco.languages.registerFoldingRangeProvider(
            "java",
            createFoldingRangeProvider(monaco)
        );

        const copyAw = monaco.editor.addEditorAction(
            createCopyAwAction(decompileResultRef, classListRef, messageApi)
        );

        const copyMixin = monaco.editor.addEditorAction(
            createCopyMixinAction(decompileResultRef, classListRef, messageApi)
        );

        const viewUsages = monaco.editor.addEditorAction(
            createFindUsagesAction(decompileResultRef, classListRef, messageApi, (value) => usageQuery.next(value))
        );

        const viewInheritance = monaco.editor.addEditorAction(
            createViewInheritanceAction(decompileResultRef, messageApi, (value) => selectedInheritanceClassName.next(value))
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
    }, [monaco, decompileResult, classList, resetViewTrigger]);

    if (IS_JAVADOC_EDITOR) {
        useEffect(() => {
            if (!monaco || !editorRef.current || !decompileResult) return;

            const extensions = applyJavadocCodeExtensions(monaco, editorRef.current, decompileResult);

            return () => {
                extensions.dispose();
            };
        }, [monaco, editorRef.current, decompileResult]);
    }

    // Scroll to top when source changes, or to specific line if specified
    useEffect(() => {
        if (editorRef.current && decompileResult) {
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
    }, [decompileResult, currentState?.line, currentState?.lineEnd]);

    // Scroll to a "Find usages" token
    useEffect(() => {
        if (editorRef.current && decompileResult) {
            if (decompileResult.language !== "java") return;

            const editor = editorRef.current;

            lineHighlightRef.current?.clear();

            const executeScroll = () => {
                const nextJumpToken = getNextJumpToken(decompileResult);
                const nextJumpLocation = nextJumpToken && getTokenLocation(decompileResult, nextJumpToken);

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
    }, [decompileResult, nextUsage]);

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
    }, []);

    // Handles setting the model and viewstate of the editor
    useEffect(() => {
        if (diffView.value) return;
        if (!monaco || !decompileResult) return;

        const tab = getOpenTab();
        if (!tab) return;
        const lang = bytecode.value ? "bytecode" : "java";

        // Create new model with the current decompilation source
        let newModel = monaco.editor.createModel(
            decompileResult.source,
            lang,
            monaco.Uri.parse(`inmemory://${Date.now()}`)
        );

        // Check if the model is different to the cached one. If yes -> invalidate view
        if (!tab.isCachedModelEqualTo(newModel)) {
            tab.invalidateCachedView();
            tab.model = newModel;
        } else {
            newModel.dispose();
        }

        if (editorRef.current) tab.applyViewToEditor(editorRef.current);
        applyTokenDecorations(tab.model!);
    }, [decompileResult, resetViewTrigger]);

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
                defaultLanguage={"java"}
                language={decompileResult?.language}
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
                    codeEditor.onDidChangeCursorPosition((e) => {
                        const token = findTokenAtPosition(codeEditor, decompileResultRef.current, classListRef.current);
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
