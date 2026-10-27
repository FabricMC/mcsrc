import { Editor, useMonaco } from "@monaco-editor/react";
import { useObservable } from "../utils/UseObservable";
import { currentResult } from "../logic/Decompiler";
import { useEffect, useState } from "react";
import type { editor } from "monaco-editor";
import { JavadocCompletionProvider } from "./JavadocCompletionProvider";
import { JavadocTagCompletionProvider } from "./JavadocTagCompletionProvider";
import { jarIndex } from "../workers/jar-index/client";
import type { Token } from "../logic/Tokens";

const JavadocMarkdownEditor = ({
    value,
    token,
    onChange
}: {
    value: string;
    token: Token;
    onChange: (newValue: string | undefined) => void;
}) => {
    const monaco = useMonaco();
    const decompileResult = useObservable(currentResult);
    const index = useObservable(jarIndex);
    const [model, setModel] = useState<editor.ITextModel | null>(null);

    useEffect(() => {
        if (!monaco || !decompileResult || !model) return;

        const provider = new JavadocCompletionProvider(decompileResult, token.className, index, model);
        const completionItemProvider = monaco.languages.registerCompletionItemProvider('markdown', provider);
        const tagCompletionProvider = monaco.languages.registerCompletionItemProvider('markdown', new JavadocTagCompletionProvider(decompileResult, token, model));

        return () => {
            completionItemProvider.dispose();
            tagCompletionProvider.dispose();
        };
    }, [monaco, decompileResult, token, index, model]);

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
                suggest: { insertMode: "replace", showWords: false },
                wordBasedSuggestions: "off",
            }}
            onMount={(codeEditor) => {
                setModel(codeEditor.getModel());
            }}
        />
    );
};

export default JavadocMarkdownEditor;
