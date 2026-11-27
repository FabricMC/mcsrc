import { useEffect } from 'react';
import * as monaco from 'monaco-editor';
import type { DecompileResult } from '../workers/decompile/types';
import { applyJavadocCodeExtensions } from './JavadocCodeExtensions';
import JavadocInlineEditor from './JavadocInlineEditor';
import { registerJavadocMarkdownLanguage } from './editor/JavadocMarkdownLanguage';
import './Javadoc.css';

registerJavadocMarkdownLanguage(monaco);

const JavadocCode = ({ codeEditor, result }: {
    codeEditor: monaco.editor.IStandaloneCodeEditor;
    result: DecompileResult;
}) => {
    useEffect(() => {
        const extensions = applyJavadocCodeExtensions(monaco, codeEditor, result);
        return () => extensions.dispose();
    }, [codeEditor, result]);

    return <JavadocInlineEditor codeEditor={codeEditor} result={result} />;
};

export default JavadocCode;
