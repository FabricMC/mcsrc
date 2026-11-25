import { Editor } from "@monaco-editor/react";
import { CheckOutlined, CloseOutlined, DeleteOutlined, FileTextOutlined, MenuFoldOutlined, MenuUnfoldOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Badge, Button, ConfigProvider, Divider, Empty, Flex, Input, Menu, Popconfirm, Space, Tooltip, Typography, theme } from "antd";
import * as monacoEditor from "monaco-editor";
import { useState } from "react";
import { isDarkMode } from "../logic/Browser";
import { useObservable } from "../utils/UseObservable";
import type { JavadocDirectorySource } from "../javadoc/JavadocStorage";
import { registerUnpickLanguage, UNPICK_LANGUAGE } from "./UnpickLanguage";
import { useUnpickEditor } from "./useUnpickEditor";

registerUnpickLanguage(monacoEditor);

const UnpickEditor = ({ source, directory }: {
    source: JavadocDirectorySource;
    directory: FileSystemDirectoryHandle;
}) => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const darkMode = useObservable(isDarkMode);
    const { token } = theme.useToken();
    const {
        busy,
        error,
        saveError,
        validationMessage,
        files,
        selected,
        newName,
        setNewName,
        setModel,
        selectFile,
        refresh,
        discardDrafts,
        saveEdit,
        createFile,
        deleteFile,
    } = useUnpickEditor(source, directory);

    return (
        <Flex
            role="region"
            aria-label="Unpick definitions"
            gap="small"
            style={{ height: "100%", boxSizing: "border-box", padding: 8, overflow: "auto" }}
        >
            <Flex vertical gap={4} style={{ width: sidebarOpen ? "min(220px, 45%)" : 24, flexShrink: 0 }}>
                <Flex align="center" vertical={!sidebarOpen} gap={sidebarOpen ? 0 : 4}>
                    <Tooltip title={sidebarOpen ? "Hide files" : "Show files"}>
                        <Button
                            type="text"
                            size="small"
                            icon={sidebarOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                            aria-label="Toggle Unpick file sidebar"
                            aria-expanded={sidebarOpen}
                            onClick={() => setSidebarOpen(open => !open)}
                        />
                    </Tooltip>
                    {sidebarOpen && <>
                        <Typography.Text strong style={{ flex: 1 }}>Files</Typography.Text>
                        <Tooltip title={newName === undefined ? "New file" : "Cancel new file"}>
                            <Button
                                type="text"
                                size="small"
                                icon={newName === undefined ? <PlusOutlined /> : <CloseOutlined />}
                                aria-label={newName === undefined ? "New file" : "Cancel new file"}
                                disabled={busy}
                                onClick={() => setNewName(name => name === undefined ? "" : undefined)}
                            />
                        </Tooltip>
                    </>}
                    <Tooltip title="Refresh files" placement={sidebarOpen ? "top" : "right"}>
                        <Button type="text" size="small" icon={<ReloadOutlined />} aria-label="Refresh files" disabled={busy} onClick={refresh} />
                    </Tooltip>
                    {sidebarOpen && (
                        <Popconfirm title={`Delete ${selected?.path}?`} okText="Delete" onConfirm={() => selected && deleteFile(selected.path)}>
                            <Button type="text" size="small" icon={<DeleteOutlined />} aria-label="Delete file" disabled={!selected || busy} />
                        </Popconfirm>
                    )}
                </Flex>
                {sidebarOpen && newName !== undefined && (
                    <Space.Compact block size="small">
                        <Input
                            autoFocus
                            aria-label="New Unpick file name"
                            placeholder="File name (.unpick)"
                            value={newName}
                            disabled={busy}
                            onChange={event => setNewName(event.target.value)}
                            onPressEnter={createFile}
                        />
                        <Button icon={<CheckOutlined />} aria-label="Create file" disabled={busy} onClick={createFile} />
                    </Space.Compact>
                )}
                {sidebarOpen && (
                    <ConfigProvider theme={{
                        components: { Menu: { itemSelectedColor: token.colorTextLightSolid, itemSelectedBg: token.colorPrimary } },
                    }}>
                        <Menu
                            aria-label="Unpick files"
                            mode="inline"
                            inlineIndent={6}
                            style={{ border: 0, overflowY: "auto" }}
                            styles={{ item: { height: 28, lineHeight: "28px", margin: 0, width: "100%" } }}
                            selectedKeys={selected ? [selected.path] : []}
                            onSelect={({ key }) => selectFile(key)}
                            items={files.map(file => ({
                                key: file.path,
                                title: file.path,
                                icon: <FileTextOutlined aria-hidden="true" />,
                                danger: file.invalid,
                                label: file.path,
                                "aria-label": file.path,
                                extra: file.unsaved && (
                                    <Tooltip title="Unsaved changes" placement="right">
                                        <Badge status="warning" role="status" aria-label="Unsaved changes" />
                                    </Tooltip>
                                ),
                            }))}
                        />
                    </ConfigProvider>
                )}
            </Flex>
            <Divider type="vertical" style={{ height: "auto", alignSelf: "stretch", margin: 0 }} />
            <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
                {selected ? (
                    <div style={{ flex: 1, minHeight: 80 }}>
                        <Editor
                            key={selected.path}
                            language={UNPICK_LANGUAGE}
                            value={selected.content}
                            theme={darkMode ? "vs-dark" : "vs"}
                            onMount={editor => setModel(editor.getModel())}
                            onChange={value => saveEdit(selected.path, value ?? "")}
                            options={{
                                ariaLabel: "Unpick definition",
                                readOnly: busy,
                                autoIndent: "none",
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                fixedOverflowWidgets: true,
                                wordBasedSuggestions: "off",
                            }}
                        />
                    </div>
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={busy ? "Reading definitions…" : "No Unpick files"} />}
                {error && <Alert type="error" title={error} />}
                {saveError && (
                    <Alert type="error" title={saveError} action={
                        <Popconfirm title="Discard unsaved Unpick edits?" onConfirm={discardDrafts}>
                            <Button size="small" disabled={busy}>Discard draft</Button>
                        </Popconfirm>
                    } />
                )}
                {validationMessage && <Alert type="error" title={validationMessage} />}
            </Flex>
        </Flex>
    );
};

export default UnpickEditor;
