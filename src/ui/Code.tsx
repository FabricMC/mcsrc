import Editor from '@monaco-editor/react';
import { useObservable } from '../utils/UseObservable';
import { currentSource } from '../logic/Decompiler';

const Code = () => {
    const src = useObservable(currentSource);

    return (
        <Editor
            height="100vh"
            defaultLanguage="java"
            theme="vs-dark"
            value={src}
            options={{ readOnly: true, tabSize: 3 }} />
    );
}

export default Code;