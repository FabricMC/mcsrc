import { DiffEditor } from '@monaco-editor/react';
import { useObservable } from '../../utils/UseObservable';
import { getLeftDiff, getRightDiff } from '../../logic/Diff';
import { updateLineChanges } from '../../logic/LineChanges';
import { useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { Spin } from "antd";
import { LoadingOutlined } from '@ant-design/icons';
import { isDecompiling } from "../../logic/Decompiler.ts";
import { selectedFile } from '../../logic/State';

interface DiffCodeProps {
    height?: number | string;
}

const DiffCode = ({ height }: DiffCodeProps) => {
    const leftResult = useObservable(getLeftDiff().result);
    const rightResult = useObservable(getRightDiff().result);
    const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
    const loading = useObservable(isDecompiling);
    const currentPath = useObservable(selectedFile);

    useEffect(() => {
        if (!loading && currentPath &&
            leftResult?.source !== undefined &&
            rightResult?.source !== undefined &&
            leftResult.className === currentPath &&
            rightResult.className === currentPath
        ) {
            updateLineChanges(currentPath, leftResult.source, rightResult.source);
        }
    }, [leftResult, rightResult, loading, currentPath]);

    /* Disabled as it jumps to the line of the previous change when switching files
    useEffect(() => {
        if (!editorRef.current) {
            return;
        }

        const lineChanges = editorRef.current.getLineChanges();
        if (lineChanges && lineChanges.length > 0) {
            const firstChange = lineChanges[0];
            console.log('Navigating to first change at line:', firstChange.modifiedStartLineNumber);
            editorRef.current.revealLineInCenter(firstChange.modifiedStartLineNumber);
        }
    }, [leftResult, rightResult]);
    */

    return (
        <Spin
            indicator={<LoadingOutlined spin />}
            size={"large"}
            spinning={!!loading}
            tip="Decompiling..."
            style={{
                height: '100%',
                color: 'white'
            }}
        >
            {/*
            Before the height is changed it is "70%", or whatever the default % is set to.
            The wrapping elements for the output editor do not have the relevant context to know what the 70% is of,
            so it falls back to 0. We must override this and specify that the height is for the viewport by swapping
            the '%' out with 'vh'. If the height is a number literal then the size has been changed and will be an
            exact pixel count
            */}
            <DiffEditor
                height={typeof height === "string" ? height.replace("\%", "vh") : height}
                language="java"
                theme="vs-dark"
                original={leftResult?.source}
                modified={rightResult?.source}
                keepCurrentModifiedModel={true}
                keepCurrentOriginalModel={true}
                onMount={(editor) => {
                    editorRef.current = editor;
                }}
                options={{
                    readOnly: true,
                    domReadOnly: true,
                    //tabSize: 3,
                }} />
        </Spin>
    );
};

export default DiffCode;
