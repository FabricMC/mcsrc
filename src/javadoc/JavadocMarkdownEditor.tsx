import { Editor, useMonaco } from "@monaco-editor/react";
import { useObservable } from "../utils/UseObservable";
import { currentResult } from "../logic/Decompiler";
import { useEffect, useRef } from "react";
import type { editor } from "monaco-editor";
import { JavdocCompletionProvider } from "./JavadocCmpletionProvider";

const JavadocMarkdownEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (newValue: string | undefined) => void;
}) => {
  const monaco = useMonaco();
  const decompileResult = useObservable(currentResult);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!monaco || !decompileResult) return;

    const completionItemProvider = monaco.languages.registerCompletionItemProvider(
      "markdown",
      new JavdocCompletionProvider(decompileResult),
    );

    return () => {
      completionItemProvider.dispose();
    };
  }, [monaco, decompileResult]);

  return (
    <Editor
      height="100%"
      defaultLanguage="markdown"
      defaultValue={value}
      onChange={onChange}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineHeight: 21,
        wordWrap: "off",
      }}
      onMount={(codeEditor) => {
        editorRef.current = codeEditor;
      }}
    />
  );
};

export default JavadocMarkdownEditor;
