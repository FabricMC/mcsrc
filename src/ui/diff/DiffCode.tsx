import { DiffEditor, useMonaco } from '@monaco-editor/react';
import { useObservable } from '../../utils/UseObservable';
import { getLeftDiff, getRightDiff } from '../../logic/Diff';
import { updateLineChanges } from '../../logic/LineChanges';
import { useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';
import { Spin } from "antd";
import { LoadingOutlined } from '@ant-design/icons';
import { isDecompiling } from "../../logic/Decompiler.ts";
import { unifiedDiff } from '../../logic/Settings';
import { selectedFile } from '../../logic/State.ts';
import { isDarkMode } from '../../logic/Browser';
import {
    jumpToCurrentFileEdge,
    pendingDiffJump,
    registerDiffNavigator,
    type DiffDirection
} from './DiffNavigation';

const IS_ANDROID_CHROME = /Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent);

const DiffCode = () => {
    const leftResult = useObservable(getLeftDiff().result);
    const rightResult = useObservable(getRightDiff().result);
    const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
    const [diffEditor, setDiffEditor] = useState<editor.IStandaloneDiffEditor | null>(null);
    const loading = useObservable(isDecompiling);
    const currentPath = useObservable(selectedFile);
    const isUnified = useObservable(unifiedDiff.observable);
    const darkMode = useObservable(isDarkMode);
    const monaco = useMonaco();

    useEffect(() => {
        if (!monaco) return;
        monaco.editor.setTheme(darkMode ? "vs-dark" : "vs");
    }, [monaco, darkMode]);

    useEffect(() => {
        if (loading) return;
        if (!currentPath) return;
        if (!leftResult) return;
        if (!rightResult) return;

        const currentClass = currentPath.replace(".class", "");
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
                }}
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    renderSideBySide: !isUnified,
                    useInlineViewWhenSpaceIsLimited: false,
                    scrollBeyondLastLine: false,
                    editContext: IS_ANDROID_CHROME ? false : undefined,
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
