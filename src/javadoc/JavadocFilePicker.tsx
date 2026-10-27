import { DownOutlined, FileAddOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { Button, Dropdown, message, Tooltip, type MenuProps } from "antd";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useObservable } from "../utils/UseObservable";
import { diffView, selectedMinecraftVersion } from "../logic/State";
import { showAnnotaterShortcut } from "../logic/Settings";
import AnnotaterIcon from "../ui/annotater.svg?react";
import { activateJavadocFile, activeJavadocFile } from "./Javadoc";
import { flushJavadocDrafts } from "./JavadocAutosave";
import {
    createJavadocFile,
    readAnnotaterDirectory,
    readJavadocDirectory,
    readJavadocFile,
    type JavadocFormat,
    type JavadocSource,
} from "./JavadocStorage";

const filePickerSupported = "showOpenFilePicker" in window && "showSaveFilePicker" in window;
const directoryPickerSupported = "showDirectoryPicker" in window;
const pickerSupported = filePickerSupported || directoryPickerSupported;

const JavadocFilePicker = ({ annotaterShortcut = false }: { annotaterShortcut?: boolean }) => {
    const selectedFile = useObservable(activeJavadocFile);
    const [loading, setLoading] = useState(false);
    const [unsupportedAttempt, setUnsupportedAttempt] = useState(0);
    const [messageApi, contextHolder] = message.useMessage();

    const handleUnsupported = () => {
        setUnsupportedAttempt(attempt => attempt + 1);
        messageApi.error("This browser does not support direct filesystem access.");
    };

    const items: MenuProps["items"] = [
        {
            key: "open",
            label: "Open mapping file…",
            icon: <FolderOpenOutlined />,
        },
        {
            key: "open-directory",
            label: "Open Enigma directory…",
            icon: <FolderOpenOutlined />,
        },
        { type: "divider" },
        {
            key: "tiny2",
            label: "Create Tiny v2…",
            icon: <FileAddOutlined />,
        },
        {
            key: "enigma",
            label: "Create Enigma…",
            icon: <FileAddOutlined />,
        },
    ];

    const openMappings = async (key: string) => {
        const supported = key === "annotater" || key === "open-directory"
            ? directoryPickerSupported
            : filePickerSupported;
        if (!supported) {
            handleUnsupported();
            return;
        }

        setLoading(true);

        try {
            await flushJavadocDrafts();
            let source: JavadocSource;
            if (key === "open") {
                const [handle] = await window.showOpenFilePicker({
                    multiple: false,
                    types: [mappingFilePickerType],
                });
                source = await readJavadocFile(handle);
            } else if (key === "annotater") {
                const handle = await window.showDirectoryPicker({ id: "annotater", mode: "readwrite" });
                const project = await readAnnotaterDirectory(handle);
                source = project.source;
                diffView.next(false);
                selectedMinecraftVersion.next(project.version);
            } else if (key === "open-directory") {
                const handle = await window.showDirectoryPicker({ mode: "readwrite" });
                source = await readJavadocDirectory(handle);
            } else if (key === "tiny2" || key === "enigma") {
                const handle = await window.showSaveFilePicker(createPickerOptions(key));
                source = await createJavadocFile(handle, key);
            } else {
                throw new Error(`Unknown Javadoc action: ${key}`);
            }

            activateJavadocFile(source);
            if (key === "annotater") {
                showAnnotaterShortcut.value = true;
            }
            messageApi.success("Javadoc mappings opened.");
        } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError")) {
                console.error("Unable to open Javadoc mappings:", error);
                const detail = error instanceof Error ? ` ${error.message}` : "";
                messageApi.error(`Unable to open Javadoc mappings.${detail}`);
            }
        } finally {
            setLoading(false);
        }
    };

    if (annotaterShortcut) {
        return (
            <>
                {contextHolder}
                <Tooltip title="Open Annotater directory…">
                    <Button
                        aria-label="Open Annotater directory"
                        disabled={loading}
                        loading={loading}
                        icon={<AnnotaterIcon width="18" height="18" aria-hidden="true" />}
                        onClick={() => openMappings("annotater")}
                    />
                </Tooltip>
            </>
        );
    }

    const button = (
        <Dropdown
            disabled={!pickerSupported || loading}
            menu={{ items, onClick: ({ key }) => openMappings(key) }}
            trigger={["click"]}
        >
            <Button
                data-testid="javadoc-mappings"
                disabled={loading}
                loading={loading}
                icon={<FolderOpenOutlined />}
                onClick={() => {
                    if (!pickerSupported) handleUnsupported();
                }}
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
            <Tooltip title={directoryPickerSupported
                ? 'Open a directory containing config.json with "mappings" and "version" keys.'
                : "This browser does not support direct filesystem access."}>
                <span>
                    <Button
                        data-testid="annotater-directory"
                        disabled={loading}
                        loading={loading}
                        icon={<AnnotaterIcon width="18" height="18" aria-hidden="true" />}
                        onClick={() => openMappings("annotater")}
                    >
                        Open Annotater directory…
                    </Button>
                </span>
            </Tooltip>
            {unsupportedAttempt >= 3 && createPortal(
                <div
                    key={unsupportedAttempt}
                    style={{
                        position: "fixed",
                        bottom: 8,
                        left: -48,
                        width: 44,
                        height: 47,
                        pointerEvents: "none",
                        zIndex: 2000,
                        animation: "javadoc-not-supported-slide 3s linear forwards",
                    }}
                    aria-hidden="true"
                    onAnimationEnd={() => setUnsupportedAttempt(0)}
                >
                    <style>{`
                        @keyframes javadoc-not-supported-slide {
                            to { transform: translateX(calc(100vw + 96px)); }
                        }
                        @keyframes javadoc-not-supported-offset {
                            50% { transform: translateY(-36px); }
                        }
                    `}</style>
                    <svg
                        viewBox="-1 -1 46 49"
                        width="44"
                        height="47"
                        style={{ animation: "javadoc-not-supported-offset 0.5s ease-in-out infinite" }}
                    >
                        <path
                            fill="white"
                            stroke="#535353"
                            strokeWidth="0.6"
                            strokeLinejoin="round"
                            fillRule="evenodd"
                            d="M2 17H4V21H6V23H8V25H12V23H14V21H17V19H20V17H22V4H24V2H40V4H42V13H32V15H38V17H30V21H34V25H32V23H30V30H28V33H26V35H24V43H26V45H22V39H20V37H18V39H16V41H14V43H16V45H12V37H10V35H8V33H6V31H4V29H2ZM26 5V7H28V5Z"
                        />
                    </svg>
                </div>,
                document.body,
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
        excludeAcceptAllOption: true,
        suggestedName: tiny ? "javadocs.tiny" : "javadocs.mapping",
        types: [{
            description: tiny ? "Tiny v2 mappings" : "Enigma mappings",
            accept: { "text/plain": [extension] },
        }],
    };
}

export default JavadocFilePicker;
