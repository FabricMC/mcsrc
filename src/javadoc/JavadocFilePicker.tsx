import { DownOutlined, FileAddOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Button, Dropdown, message, Tooltip, type MenuProps } from "antd";
import { useState } from "react";
import { useObservable } from "../utils/UseObservable";
import { activateJavadocFile, activeJavadocFile } from "./Javadoc";
import {
    createJavadocFile,
    readJavadocDirectory,
    readJavadocFile,
    type JavadocFormat,
} from "./JavadocStorage";

const filePickerSupported = "showOpenFilePicker" in window && "showSaveFilePicker" in window;
const directoryPickerSupported = "showDirectoryPicker" in window;
const pickerSupported = filePickerSupported || directoryPickerSupported;

const JavadocFilePicker = () => {
    const selectedFile = useObservable(activeJavadocFile);
    const [loading, setLoading] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const items: MenuProps["items"] = [
        {
            key: "open",
            label: "Open mapping file…",
            icon: <FolderOpenOutlined />,
            disabled: !filePickerSupported,
        },
        {
            key: "open-directory",
            label: "Open Enigma directory…",
            icon: <FolderOpenOutlined />,
            disabled: !directoryPickerSupported,
        },
        { type: "divider" },
        {
            key: "tiny2",
            label: "Create Tiny v2…",
            icon: <FileAddOutlined />,
            disabled: !filePickerSupported,
        },
        {
            key: "enigma",
            label: "Create Enigma…",
            icon: <FileAddOutlined />,
            disabled: !filePickerSupported,
        },
    ];

    const handleMenuClick: MenuProps["onClick"] = async ({ key }) => {
        setLoading(true);

        try {
            if (key === "open") {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [mappingFilePickerType],
                });
                const file = await readJavadocFile(handle);
                activateJavadocFile(file);
            } else if (key === "open-directory") {
                const handle = await window.showDirectoryPicker({ mode: "readwrite" });
                const directory = await readJavadocDirectory(handle);
                activateJavadocFile(directory);
            } else {
                const format = key as JavadocFormat;
                const handle = await window.showSaveFilePicker(createPickerOptions(format));
                const file = await createJavadocFile(handle, format);
                activateJavadocFile(file);
            }

            messageApi.success("Javadoc mappings opened.");
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.error("Unable to open Javadoc mapping file:", error);
                const detail = error instanceof Error ? ` ${error.message}` : "";
                messageApi.error(`Unable to open Javadoc mapping file.${detail}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const button = (
        <Dropdown
            disabled={!pickerSupported || loading}
            menu={{ items, onClick: handleMenuClick }}
            trigger={["click"]}
        >
            <Button
                data-testid="javadoc-mappings"
                disabled={!pickerSupported}
                loading={loading}
                icon={<FolderOpenOutlined />}
            >
                {selectedFile?.handle.name ?? "Javadoc mappings"}
                <DownOutlined />
            </Button>
        </Dropdown>
    );

    return (
        <>
            {contextHolder}
            {pickerSupported ? button : (
                <Tooltip title="This browser does not support direct filesystem access.">
                    <span>{button}</span>
                </Tooltip>
            )}
        </>
    );
};

const mappingFilePickerType: FilePickerAcceptType = {
    description: "Javadoc mappings",
    accept: {
        "text/plain": [".tiny", ".mapping"],
    },
};

function createPickerOptions(format: JavadocFormat): SaveFilePickerOptions {
    const tiny = format === "tiny2";
    const extension = tiny ? ".tiny" : ".mapping";

    return {
        suggestedName: tiny ? "javadocs.tiny" : "javadocs.mapping",
        types: [{
            description: tiny ? "Tiny v2 mappings" : "Enigma mappings",
            accept: { "text/plain": [extension] },
        }],
    };
}

export default JavadocFilePicker;
