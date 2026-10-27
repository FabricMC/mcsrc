import Editor, { DiffEditor } from "@monaco-editor/react";
import { Flex } from "antd";
import { useObservable } from "../../utils/UseObservable";
import { isDarkMode } from "../../logic/Browser";

export default function JsonView({ left, right }: { left: unknown; right?: unknown }) {
    const darkMode = useObservable(isDarkMode);
    const theme = darkMode ? "vs-dark" : "vs";
    const options = {
        readOnly: true,
        domReadOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 12,
    };
    const original = JSON.stringify(left, null, 2);
    return (
        <Flex flex={1} style={{ minHeight: 0, overflow: "hidden" }}>
            {right !== undefined ? (
                <DiffEditor language="json" theme={theme}
                    original={original} modified={JSON.stringify(right, null, 2)}
                    options={{ ...options, originalEditable: false }} />
            ) : (
                <Editor language="json" theme={theme} value={original} options={options} />
            )}
        </Flex>
    );
}
