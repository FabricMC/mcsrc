import { Editor, useMonaco } from "@monaco-editor/react";
import { useObservable } from "../utils/UseObservable";
import { currentResult } from "../logic/Decompiler";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import { JavadocCompletionProvider } from "./JavadocCompletionProvider";
import { JavadocTagCompletionProvider } from "./JavadocTagCompletionProvider";
import { jarIndex } from "../workers/jar-index/client";
import type { Token } from "../logic/Tokens";
import { applyJavadocValidation } from "./JavadocValidationMarkers";
import { getJavadocDeclaration } from "./JavadocDeclaration";
import { registerJavadocCodeActions } from "./JavadocCodeActions";
import { isDarkMode } from "../logic/Browser";
import { JAVADOC_MARKDOWN_LANGUAGE } from "./JavadocMarkdownLanguage";

const MIN_EDITOR_HEIGHT = 84;
const MAX_EDITOR_HEIGHT = 320;

const JavadocMarkdownEditor = ({
    value,
    token,
    onChange,
    readOnly = false,
}: {
    value: string;
    token: Token;
    onChange: (newValue: string | undefined) => void;
    readOnly?: boolean;
}) => {
    const monaco = useMonaco();
    const decompileResult = useObservable(currentResult);
    const index = useObservable(jarIndex);
    const [model, setModel] = useState<editor.ITextModel | null>(null);
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
        if (!monaco || !decompileResult || !model) return;

        const provider = new JavadocCompletionProvider(decompileResult, token.className, index, model);
        const completionItemProvider = monaco.languages.registerCompletionItemProvider(JAVADOC_MARKDOWN_LANGUAGE, provider);
        const tagCompletionProvider = monaco.languages.registerCompletionItemProvider(JAVADOC_MARKDOWN_LANGUAGE, new JavadocTagCompletionProvider(decompileResult, token, model));

        return () => {
            completionItemProvider.dispose();
            tagCompletionProvider.dispose();
        };
    }, [monaco, decompileResult, token, index, model]);

    useEffect(() => {
        if (!monaco || !decompileResult || !model) return;

        const declaration = getJavadocDeclaration(decompileResult, token);
        const validation = applyJavadocValidation(monaco, model, declaration);
        const codeActions = registerJavadocCodeActions(monaco, model, declaration);
        return () => {
            codeActions.dispose();
            validation.dispose();
        };
    }, [monaco, decompileResult, token, model]);

    return (
        <Editor
            height={height}
            defaultLanguage={JAVADOC_MARKDOWN_LANGUAGE}
            defaultValue={value}
            onChange={onChange}
            theme={darkMode ? "vs-dark" : "vs"}
            options={{
                ariaLabel: "Javadoc Markdown",
                readOnly,
                fixedOverflowWidgets: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                fontSize: 14,
                lineHeight: 21,
                wordWrap: "on",
                suggest: { insertMode: "replace", showWords: false },
                wordBasedSuggestions: "off",
            }}
            onMount={(codeEditor) => {
                setModel(codeEditor.getModel());
                setCodeEditor(codeEditor);
                codeEditor.focus();
            }}
        />
    );
};

export default JavadocMarkdownEditor;
