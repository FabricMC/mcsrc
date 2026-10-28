import { defer } from "rxjs";
import { Editor, useMonaco } from "@monaco-editor/react";
import { useObservable } from "../../utils/UseObservable";
import { currentResult } from "../../logic/Decompiler";
import { useEffect, useState } from "react";
import type { editor, IDisposable } from "monaco-editor";
import { JavadocCompletionProvider } from "./JavadocCompletionProvider";
import { JavadocTagCompletionProvider } from "./JavadocTagCompletionProvider";
import { jarIndex } from "../../workers/jar-index/client";
import type { Token } from "../../logic/Tokens";
import { applyJavadocDiagnostics } from "./JavadocDiagnostics";
import { getJavadocDeclaration, type DeclarationMetadata } from "./JavadocDeclaration";
import { isDarkMode } from "../../logic/Browser";
import { JAVADOC_MARKDOWN_LANGUAGE } from "./JavadocMarkdownLanguage";
import { minecraftJar } from "../../logic/MinecraftApi";
import { toClassFilePath } from "../../utils/Names";
import { toArrayBuffer } from "../../utils/ArrayBuffer";
import { readJavadocDeclarationMetadata } from "../JavadocStorage";
import { autoJarIndex } from "../../logic/Settings";

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
    const loadedIndex = useObservable(jarIndex);
    const indexAutomatically = useObservable(autoJarIndex.observable);
    const index = indexAutomatically ? loadedIndex : undefined;
    const jar = useObservable(minecraftJar);
    const [codeEditor, setCodeEditor] = useState<editor.IStandaloneCodeEditor | null>(null);
    const model = codeEditor?.getModel();
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
        if (!monaco || !decompileResult || !model || !jar || jar.jar.name !== decompileResult.jarName) return;

        const disposables: IDisposable[] = [
            monaco.languages.registerCompletionItemProvider(JAVADOC_MARKDOWN_LANGUAGE, new JavadocCompletionProvider(decompileResult, token.className, index, model)),
        ];
        const subscription = defer(async () => {
            let metadata: DeclarationMetadata = { typeParameters: [], exceptions: [], recordComponents: [] };
            if (token.type === "class" || token.type === "method") {
                const entry = jar.jar.entries[toClassFilePath(token.className)];
                if (!entry) throw new Error(`Class not found: ${token.className}`);

                const bytes = toArrayBuffer(await entry.bytes());
                const methodName = token.type === "method" ? token.name : "";
                const descriptor = token.type === "method" ? token.descriptor : "";
                metadata = await readJavadocDeclarationMetadata(bytes, methodName, descriptor);
            }
            return getJavadocDeclaration(decompileResult, token, metadata);
        }).subscribe({
            next(declaration) {
                if (model.isDisposed()) return;

                disposables.push(
                    monaco.languages.registerCompletionItemProvider(JAVADOC_MARKDOWN_LANGUAGE, new JavadocTagCompletionProvider(declaration, model)),
                    applyJavadocDiagnostics(monaco, model, declaration),
                );
            },
            error: error => console.error("Failed to read Javadoc declaration metadata:", error),
        });
        return () => {
            subscription.unsubscribe();
            for (const disposable of disposables) {
                disposable.dispose();
            }
        };
    }, [monaco, decompileResult, token, index, model, jar]);

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
                setCodeEditor(codeEditor);
                codeEditor.focus();
            }}
        />
    );
};

export default JavadocMarkdownEditor;
