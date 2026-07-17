import { DiffEditor, useMonaco } from '@monaco-editor/react';
import { useObservable } from '../../utils/UseObservable';
import { getLeftDiff, getRightDiff } from '../../logic/Diff';
import { updateLineChanges } from '../../logic/LineChanges';
import { useEffect, useRef, useState } from 'react';
import { editor, Range } from 'monaco-editor';
import { message, Spin } from "antd";
import { LoadingOutlined } from '@ant-design/icons';
import { isDecompiling } from "../../logic/Decompiler.ts";
import { unifiedDiff } from '../../logic/Settings';
import { selectedFile, selectedLines, diffSelectionSide } from '../../logic/State.ts';
import { isDarkMode } from '../../logic/Browser';
import {
    jumpToCurrentFileEdge,
    pendingDiffJump,
    registerDiffNavigator,
    type DiffDirection
} from './DiffNavigation';
import { classNameFromClassFilePath } from '../../utils/Names';
import { createCopyPermalinkAction } from './DiffCodeContextActions.ts';

const IS_ANDROID_CHROME = /Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent);

const DiffCode = () => {
    const leftResult = useObservable(getLeftDiff().result);
    const rightResult = useObservable(getRightDiff().result);
    const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
    const [diffEditor, setDiffEditor] = useState<editor.IStandaloneDiffEditor | null>(null);
    const [originalEditor, setOriginalEditor] = useState<editor.IStandaloneCodeEditor | null>(null);
    const [modifiedEditor, setModifiedEditor] = useState<editor.IStandaloneCodeEditor | null>(null);
    const [editorsReady, setEditorsReady] = useState(false);
    const loading = useObservable(isDecompiling);
    const currentPath = useObservable(selectedFile);
    const isUnified = useObservable(unifiedDiff.observable);
    const darkMode = useObservable(isDarkMode);

    const selectedLine = useObservable(selectedLines);
    const selectionSide = useObservable(diffSelectionSide);
    const lineHighlightRef = useRef<editor.IEditorDecorationsCollection | null>(null);
    const selectedLineRef = useRef(selectedLine);
    const lastLineSelectionTime = useRef(0);

    const loadTime = useRef(Date.now());

    const [messageApi, contextHolder] = message.useMessage();

    const monaco = useMonaco();

    function handleOnEditorMount(editor: editor.IStandaloneDiffEditor) {
        const checkEditors = () => {
            const original = editor.getOriginalEditor();
            const modified = editor.getModifiedEditor();
            if (original && modified) {
                setOriginalEditor(original);
                setModifiedEditor(modified);
                setEditorsReady(true);

                return true;
            }
            return false;
        };

        const interval = setInterval(() => {
            if (checkEditors()) {
                clearInterval(interval);
            }
        }, 100);
    }

    useEffect(() => {
        if (!monaco) return;
        monaco.editor.setTheme(darkMode ? "vs-dark" : "vs");
    }, [monaco, darkMode]);

    useEffect(() => {
        if (!originalEditor || !modifiedEditor) return;

        const originalEditorCopyLink = originalEditor.addAction(createCopyPermalinkAction(messageApi, "left"));
        const modifiedEditorCopyLink = modifiedEditor.addAction(createCopyPermalinkAction(messageApi, "right"));

        return () => {
            // Dispose in the oppsite order
            modifiedEditorCopyLink.dispose();
            originalEditorCopyLink.dispose();
        };
    }, [originalEditor, modifiedEditor, messageApi]);

    useEffect(() => {
        if (loading) return;
        if (!currentPath) return;
        if (!leftResult) return;
        if (!rightResult) return;

        const currentClass = classNameFromClassFilePath(currentPath);
        if (leftResult.className !== currentClass) return;
        if (rightResult.className !== currentClass) return;

        updateLineChanges(currentPath, leftResult.source, rightResult.source);
    }, [leftResult, rightResult, loading, currentPath]);

    useEffect(() => {
        if (!diffEditor) return;

        const navigator = createDiffNavigator(diffEditor);
        const unregister = registerDiffNavigator(navigator);
        const updateDisposable = diffEditor.onDidUpdateDiff(() => {
            navigator.reset();
            const pendingDirection = pendingDiffJump.value;
            if (!pendingDirection) return;

            if (jumpToCurrentFileEdge(pendingDirection)) {
                pendingDiffJump.next(null);
            }
        });

        return () => {
            updateDisposable.dispose();
            unregister();
        };
    }, [diffEditor]);

    // Scroll to top when source changes, or to specific line if specified
    useEffect(() => {
        if (editorRef.current && leftResult && rightResult) {
            const editor = editorRef.current;
            lineHighlightRef.current?.clear();

            const getActiveSelectionEditor = (editor: editor.IStandaloneDiffEditor) => {
                return selectionSide === "left" ? editor.getOriginalEditor() : editor.getModifiedEditor();
            }

            const executeScroll = () => {
                const currentLine = selectedLine?.line;
                if (currentLine) {
                    const lineEnd = selectedLine?.lineEnd ?? currentLine;
                    getActiveSelectionEditor(editor).revealLinesInCenterIfOutsideViewport(currentLine, lineEnd);

                    // Highlight the line range
                    lineHighlightRef.current = getActiveSelectionEditor(editor).createDecorationsCollection([{
                        range: new Range(currentLine, 1, lineEnd, 1),
                        options: {
                            isWholeLine: true,
                            className: 'highlighted-line',
                            glyphMarginClassName: 'highlighted-line-glyph'
                        }
                    }]);
                }
            };

            // Use requestAnimationFrame to ensure Monaco has finished layout
            requestAnimationFrame(() => {
                executeScroll();
            });
        }
    }, [leftResult, rightResult, selectedLine, selectionSide]);

    // Handle gutter clicks for line linking
    useEffect(() => {
        selectedLineRef.current = selectedLine;
    }, [selectedLine]);

    useEffect(() => {
        if (!originalEditor || !modifiedEditor) return;

        const onMouseDownEvents =
            [originalEditor, modifiedEditor].map((codeEditor, index) => {
                return codeEditor.onMouseDown((e) => {
                    if (e.target.type === editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
                        e.target.type === editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
                        const lineNumber = e.target.position?.lineNumber;

                        if (lineNumber) {
                            // Shift-click to select a range
                            if (e.event.shiftKey && selectedLineRef.current) {
                                selectedLines.next({ line: selectedLineRef.current.line, lineEnd: lineNumber });
                            } else {
                                selectedLines.next({ line: lineNumber });
                            }
                            diffSelectionSide.next(index === 0 ? 'left' : 'right');

                            lastLineSelectionTime.current = Date.now();
                        }
                    }
                });
            });

        return () => {
            onMouseDownEvents.forEach(event => event.dispose());
        };
    }, [editorsReady, originalEditor, modifiedEditor]);

    // Left line selection in the unified mode is not supported
    // If the user tries to the line in the unified mode or entering with a line hash URL, fall back to side-by-side
    // If the user tries to switch to unified mode while left line is selected, cancel the selection
    useEffect(() => {
        if (!isUnified || !unifiedDiff.value) return; // To avoid observable updating latency
        if (!selectedLine?.line || !selectionSide || !selectionSide || selectionSide === 'right') return;

        if (Date.now() - lastLineSelectionTime.current < 500 || Date.now() - loadTime.current < 500) {
            unifiedDiff.value = false;
        } else {
            selectedLines.next(null);
            diffSelectionSide.next(null);
        }
        messageApi.warning("Left line selection is not supported in unified mode.");
    }, [isUnified, selectedLine?.line, selectionSide, messageApi]);

    return (
        <Spin
            indicator={<LoadingOutlined spin />}
            size={"large"}
            spinning={!!loading}
            description="Decompiling..."
            styles={{
                root: {
                    height: '100%',
                    color: 'white'
                },
                container: {
                    height: '100%',
                }
            }}
        >
            {contextHolder}
            <DiffEditor
                language="java"
                theme={darkMode ? "vs-dark" : "vs"}
                original={leftResult?.source}
                modified={rightResult?.source}
                keepCurrentModifiedModel={true}
                keepCurrentOriginalModel={true}
                onMount={(editor) => {
                    editorRef.current = editor;
                    setDiffEditor(editor);

                    handleOnEditorMount(editor);
                }}
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    renderSideBySide: !isUnified,
                    useInlineViewWhenSpaceIsLimited: false,
                    scrollBeyondLastLine: false,
                    editContext: IS_ANDROID_CHROME ? false : undefined,
                    selectOnLineNumbers: false // To avoid blue flash when selecting lines
                    //tabSize: 3,
                }} />
        </Spin>
    );
};

function createDiffNavigator(diffEditor: editor.IStandaloneDiffEditor) {
    let activeChangeIndex: number | null = null;
    let lineChangeSignature = "";

    return {
        jumpWithinFile(direction: DiffDirection) {
            const lineChanges = diffEditor.getLineChanges() || [];
            if (lineChanges.length === 0) return false;

            const targetIndex = activeChangeIndex === null
                ? findChangeIndexFromEditor(diffEditor, lineChanges, direction)
                : activeChangeIndex + direction;
            const target = lineChanges[targetIndex];

            if (!target) return false;

            revealLineChange(diffEditor, target, direction);
            activeChangeIndex = targetIndex;
            return true;
        },
        jumpToFileEdge(direction: DiffDirection) {
            const lineChanges = diffEditor.getLineChanges() || [];
            const targetIndex = direction === 1 ? 0 : lineChanges.length - 1;
            const target = lineChanges[targetIndex];
            if (!target) return false;

            revealLineChange(diffEditor, target, direction);
            activeChangeIndex = targetIndex;
            return true;
        },
        reset() {
            const nextSignature = getLineChangeSignature(diffEditor.getLineChanges() || []);
            if (nextSignature !== lineChangeSignature) {
                activeChangeIndex = null;
                lineChangeSignature = nextSignature;
            }
        }
    };
}

function getLineChangeSignature(lineChanges: editor.ILineChange[]) {
    return lineChanges
        .map(change => [
            change.originalStartLineNumber,
            change.originalEndLineNumber,
            change.modifiedStartLineNumber,
            change.modifiedEndLineNumber
        ].join(":"))
        .join(",");
}

function findChangeIndexFromEditor(
    diffEditor: editor.IStandaloneDiffEditor,
    lineChanges: editor.ILineChange[],
    direction: DiffDirection
) {
    const currentLine = getCurrentLine(diffEditor, direction);
    if (direction === 1) {
        return lineChanges.findIndex(change => getComparableLine(change) > currentLine);
    }

    for (let index = lineChanges.length - 1; index >= 0; index--) {
        const change = lineChanges[index];
        if (getComparableLine(change) < currentLine) {
            return index;
        }
    }

    return -1;
}

function getCurrentLine(diffEditor: editor.IStandaloneDiffEditor, direction: DiffDirection) {
    const modifiedEditor = diffEditor.getModifiedEditor();
    const position = modifiedEditor.getPosition();
    if (position) return position.lineNumber;

    const visibleRanges = modifiedEditor.getVisibleRanges();
    const visibleRange = direction === 1 ? visibleRanges[0] : visibleRanges.at(-1);
    return visibleRange ? direction === 1 ? visibleRange.startLineNumber : visibleRange.endLineNumber : 0;
}

function getComparableLine(change: editor.ILineChange) {
    if (change.modifiedStartLineNumber > 0) return change.modifiedStartLineNumber;
    if (change.modifiedEndLineNumber > 0) return change.modifiedEndLineNumber;
    return change.originalStartLineNumber;
}

function revealLineChange(
    diffEditor: editor.IStandaloneDiffEditor,
    change: editor.ILineChange,
    direction: DiffDirection
) {
    const modifiedLine = getRevealLine(change.modifiedStartLineNumber, change.modifiedEndLineNumber, direction);
    const originalLine = getRevealLine(change.originalStartLineNumber, change.originalEndLineNumber, direction);

    if (modifiedLine !== null) {
        revealEditorLine(diffEditor.getModifiedEditor(), modifiedLine);
    }

    if (originalLine !== null) {
        revealEditorLine(diffEditor.getOriginalEditor(), originalLine);
    }
}

function getRevealLine(startLine: number, endLine: number, direction: DiffDirection) {
    const line = direction === 1 ? startLine : endLine;
    if (line > 0) return line;

    const fallbackLine = direction === 1 ? endLine : startLine;
    return fallbackLine > 0 ? fallbackLine : null;
}

function revealEditorLine(codeEditor: editor.ICodeEditor, line: number) {
    codeEditor.setPosition({ lineNumber: line, column: 1 });
    codeEditor.revealLineInCenter(line);
    codeEditor.focus();
}

export default DiffCode;
