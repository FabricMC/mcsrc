import { DiffEditor } from "@monaco-editor/react";
import { useObservable } from "../../utils/UseObservable";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";
import { updateLineChanges } from "../../logic/LineChanges";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import { isDecompiling } from "../../logic/Decompiler.ts";
import { unifiedDiff } from "../../logic/Settings";
import { selectedFile } from "../../logic/State.ts";

const DiffCode = () => {
  const leftResult = useObservable(getLeftDiff().result);
  const rightResult = useObservable(getRightDiff().result);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);
  const loading = useObservable(isDecompiling);
  const currentPath = useObservable(selectedFile);
  const isUnified = useObservable(unifiedDiff.observable);

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
      description="Decompiling..."
      styles={{
        root: {
          height: "100%",
          color: "white",
        },
        container: {
          height: "100%",
        },
      }}
    >
      <DiffEditor
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
          renderSideBySide: !isUnified,
          scrollBeyondLastLine: false,
          //tabSize: 3,
        }}
      />
    </Spin>
  );
};

export default DiffCode;
