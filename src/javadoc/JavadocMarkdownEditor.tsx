import { Editor, useMonaco } from "@monaco-editor/react";
import { useObservable } from "../utils/UseObservable";
import { currentResult } from "../logic/Decompiler";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import { JavdocCompletionProvider } from "./JavadocCmpletionProvider";
import { isDarkMode } from "../logic/Browser";

const MIN_EDITOR_HEIGHT = 84;
const MAX_EDITOR_HEIGHT = 320;

const JavadocMarkdownEditor = ({
    value,
    onChange,
    readOnly = false,
}: {
    value: string;
    onChange: (newValue: string | undefined) => void;
    readOnly?: boolean;
}) => {
    const monaco = useMonaco();
    const decompileResult = useObservable(currentResult);
    const [codeEditor, setCodeEditor] = useState<editor.IStandaloneCodeEditor | null>(null);
    const [height, setHeight] = useState(MIN_EDITOR_HEIGHT);
    const darkMode = useObservable(isDarkMode);

    useEffect(() => {
        if (!codeEditor) return;

        const updateHeight = () => {
            const contentHeight = codeEditor.getContentHeight();
            setHeight(Math.max(MIN_EDITOR_HEIGHT, Math.min(MAX_EDITOR_HEIGHT, contentHeight)));
        };
        updateHeight();
        const listener = codeEditor.onDidContentSizeChange(updateHeight);
        return () => listener.dispose();
    }, [codeEditor]);

    useEffect(() => {
        if (!monaco || !decompileResult) return;

        const completionItemProvider = monaco.languages.registerCompletionItemProvider('markdown', new JavdocCompletionProvider(decompileResult));

        return () => {
            completionItemProvider.dispose();
        };
    }, [monaco, decompileResult]);

    return (
        <Editor
            height={height}
            defaultLanguage="markdown"
            defaultValue={value}
            onChange={onChange}
            theme={darkMode ? "vs-dark" : "vs"}
            options={{
                ariaLabel: "Javadoc Markdown",
                readOnly,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineHeight: 21,
                wordWrap: "on",
            }}
            onMount={(codeEditor) => {
                setCodeEditor(codeEditor);
                codeEditor.focus();
            }}
        />
    );
};

export default JavadocMarkdownEditor;
