import { type CSSProperties, memo, useCallback, useEffect, useMemo, useState } from "react";
import { CaretDownFilled, EditOutlined, MinusOutlined, PlusOutlined } from "@ant-design/icons";
import { Divider, Empty, Flex, Input, Tree, type TreeDataNode, type TreeProps } from "antd";
import type { SearchProps } from "antd/es/input";
import type { Key } from "antd/es/table/interface";
import { BehaviorSubject, combineLatest, map } from "rxjs";
import {
    getDiffChanges,
    type ChangeInfo,
    type ChangeState,
} from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler";
import { performSearch } from "../../logic/Search";
import { selectedFile } from "../../logic/State";
import { openCodeTab } from "../../logic/tabs";
import { useObservable } from "../../utils/UseObservable";
import { pendingDiffJump } from "./DiffNavigation";
import { withoutClassExtension, type ClassFilePath } from "../../utils/Names";
import { diffTreeView, sortDiff } from "../../logic/Settings.ts";
import { JavaIcon, PackageIcon } from "../intellij-icons";

const statusColors: Record<ChangeState, string> = {
    modified: "gold",
    added: "green",
    deleted: "red",
};

const statusColorsHex: Record<ChangeState, string> = {
    modified: "var(--ant-color-warning)",
    added: "var(--ant-color-success)",
    deleted: "var(--ant-color-error)",
};

const statusIcons: Record<ChangeState, React.ReactElement> = {
    modified: <EditOutlined />,
    added: <PlusOutlined />,
    deleted: <MinusOutlined />,
};

const searchQuery = new BehaviorSubject("");

interface DiffEntry {
    key: ClassFilePath;
    file: ClassFilePath;
    statusInfo: ChangeInfo;
}

const DiffViewFileList = () => {
    const onChange: SearchProps["onChange"] = (event) => {
        searchQuery.next(event.target.value);
    };
    const treeView = useObservable(diffTreeView.observable) ?? true;

    return (
        <Flex vertical flex={1} style={{ minHeight: 0 }}>
            <div style={{ padding: "0 12px 10px" }}>
                <Input.Search
                    allowClear
                    placeholder="Search"
                    aria-label="Search changed files"
                    onChange={onChange}
                />
            </div>
            <Divider style={{ margin: 0 }} />
            {treeView ? <DiffChangedFilesTree /> : <DiffChangedFiles />}
        </Flex>
    );
};

const DiffChangedFiles = () => {
    const entries = useMemo(() => combineLatest([getDiffChanges(), searchQuery, sortDiff.observable]).pipe(
        map(([changesMap, query, sortByChange]) => {
            const files = query ? performSearch(query, [...changesMap.keys()]) : [...changesMap.keys()];
            const nextEntries: DiffEntry[] = [];

            for (const file of files) {
                const info = changesMap.get(file);
                if (!info) continue;

                nextEntries.push({
                    key: file,
                    file,
                    statusInfo: info,
                });
            }

            nextEntries.sort((first, second) => sortDiffEntries(first, second, sortByChange));

            return nextEntries;
        })
    ), []);
    const dataSource = useObservable(entries) || [];
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const query = useObservable(searchQuery);

    if (dataSource.length === 0) {
        return (
            <Flex flex={1} align="center" justify="center">
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={query?.trim() ? "No matching files" : "No changed files"}
                />
            </Flex>
        );
    }

    return (
        <div
            aria-label="Changed files"
            className="diff-file-list"
            role="list"
            style={{ flex: 1, minHeight: 0, overflow: "auto", borderInlineEnd: 0 }}
        >
            {dataSource.map((entry) => (
                <DiffFileRow
                    key={entry.key}
                    entry={entry}
                    selected={currentFile === entry.file}
                    disabled={!!loading}
                />
            ))}
        </div>
    );
};

function sortDiffEntries(a: DiffEntry, b: DiffEntry, sortByChange: boolean): number {
    if (sortByChange) {
        if (a.statusInfo.state === b.statusInfo.state) {
            return a.file.localeCompare(b.file);
        }
        return changeStateToValue(a.statusInfo.state) - changeStateToValue(b.statusInfo.state);
    } else {
        return a.file.localeCompare(b.file);
    }
}

function changeStateToValue(changeState: ChangeState): number {
    switch (changeState) {
        case "modified": return 0;
        case "added": return 1;
        case "deleted": return 2;
    }
}

interface DiffFileRowProps {
    entry: DiffEntry;
    selected: boolean;
    disabled: boolean;
}

const DiffFileRow = memo(({ entry, selected, disabled }: DiffFileRowProps) => {
    const file = withoutClassExtension(entry.file);
    const segments = file.split("/");
    const name = segments.at(-1) || file;
    const path = segments.slice(0, -1).join("/");

    return (
        <button
            type="button"
            className={`diff-file-row${selected ? " diff-file-row-selected" : ""}`}
            disabled={disabled}
            onClick={() => {
                if (selected || disabled) return;
                pendingDiffJump.next(1);
                openCodeTab(entry.file);
            }}
            style={{
                ...fileRowStyle,
                background: selected ? "var(--ant-color-primary-bg)" : "transparent",
                borderColor: selected ? "var(--ant-color-primary-border)" : "transparent",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.7 : undefined
            }}
        >
            <span style={fileTextStyle}>
                <span
                    className="diff-file-name"
                    style={{ ...fileNameStyle, color: statusColorsHex[entry.statusInfo.state] }}
                >
                    {name}
                </span>
                {path && <span style={filePathStyle}>{path}</span>}
            </span>
            <span style={fileMetaStyle}>
                <span style={{
                    ...statusStyle,
                    color: statusColors[entry.statusInfo.state] || "var(--ant-color-text-secondary)"
                }}>
                    {entry.statusInfo.state}
                </span>
                <DiffLineCounts info={entry.statusInfo} />
            </span>
        </button>
    );
});

function getPathKeys(filePath: string): Key[] {
    const withoutExt = withoutClassExtension(filePath);
    const parts = withoutExt.split("/").slice(0, -1);
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        result.push(parts.slice(0, i + 1).join("/"));
    }
    return result;
}

const DiffChangedFilesTree = () => {
    const [expandedKeys, setExpandedKeys] = useState<Key[]>();
    const entries = useMemo(() => combineLatest([getDiffChanges(), searchQuery, sortDiff.observable]).pipe(
        map(([changesMap, query, sortByChange]) => {
            const files = query ? performSearch(query, [...changesMap.keys()]) : [...changesMap.keys()];
            const nextEntries: DiffEntry[] = [];

            for (const file of files) {
                const info = changesMap.get(file);
                if (!info) continue;

                nextEntries.push({
                    key: file,
                    file,
                    statusInfo: info,
                });
            }

            nextEntries.sort((first, second) => sortDiffEntries(first, second, sortByChange));

            return nextEntries;
        })
    ), []);
    const dataSource = useObservable(entries);
    const files = useMemo(() => dataSource ?? [], [dataSource]);
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const query = useObservable(searchQuery);

    const treeData = useMemo(() => buildDiffTree(files), [files]);

    useEffect(() => {
        if (expandedKeys === undefined) {
            if (currentFile) {
                setExpandedKeys(getPathKeys(currentFile));
            } else if (treeData.length > 0) {
                const keys: string[] = [];
                const collect = (nodes: TreeDataNode[]) => {
                    for (const node of nodes) {
                        if (!node.isLeaf && node.key) {
                            keys.push(node.key as string);
                        }
                        if (node.children) {
                            collect(node.children);
                        }
                    }
                };
                collect(treeData);
                setExpandedKeys(keys.slice(0, 50));
            }
        }
    }, [expandedKeys, currentFile, treeData]);

    useEffect(() => {
        if (currentFile && expandedKeys !== undefined) {
            const pathKeys = getPathKeys(currentFile);
            const newKeys = [...new Set([...expandedKeys, ...pathKeys])];
            if (newKeys.length !== expandedKeys.length) {
                setExpandedKeys(newKeys);
            }
        }
    }, [currentFile, expandedKeys]);

    const onSelect: TreeProps["onSelect"] = useCallback((selectedKeys: Key[]) => {
        if (selectedKeys.length === 0) return;
        const key = selectedKeys[0];
        if (typeof key !== "string") return;
        if (loading) return;
        if (currentFile === key) return;
        pendingDiffJump.next(1);
        openCodeTab(key as ClassFilePath);
    }, [loading, currentFile]);

    if (files.length === 0) {
        return (
            <Flex flex={1} align="center" justify="center">
                <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={query?.trim() ? "No matching files" : "No changed files"}
                />
            </Flex>
        );
    }

    return (
        <div
            aria-label="Changed files"
            className="diff-file-list"
            style={{ flex: 1, minHeight: 0, overflow: "auto", borderInlineEnd: 0 }}
        >
            <Tree.DirectoryTree
                showLine
                motion={0}
                switcherIcon={({ expanded }) => (
                    <CaretDownFilled className={expanded ? "file-tree-switcher-icon" : "file-tree-switcher-icon file-tree-switcher-icon-collapsed"} />
                )}
                selectedKeys={currentFile ? [currentFile] : []}
                onSelect={onSelect}
                treeData={treeData}
                expandedKeys={expandedKeys ?? []}
                onExpand={setExpandedKeys}
                disabled={!!loading}
                titleRender={(nodeData) => (
                    <DiffTreeNodeTitle nodeData={nodeData} />
                )}
            />
        </div>
    );
};

interface DiffTreeNodeData extends TreeDataNode {
    statusInfo?: ChangeInfo;
    filePath?: ClassFilePath;
    changeCounts?: { added: number; modified: number; deleted: number; };
}

const DiffTreeNodeTitle = ({ nodeData }: { nodeData: TreeDataNode; }) => {
    const data = nodeData as DiffTreeNodeData;
    if (data.isLeaf && data.statusInfo && data.filePath) {
        return (
            <Flex align="center" gap={6} style={{ minWidth: 0, width: "100%" }}>
                <span
                    style={{
                        ...ellipsisStyle,
                        flex: 1,
                        color: statusColorsHex[data.statusInfo.state]
                    }}
                >
                    {nodeData.title?.toString()}
                </span>
                <Flex align="center" gap={6} style={{ flexShrink: 0 }}>
                    <DiffLineCountsTree info={data.statusInfo} compact />
                </Flex>
            </Flex>
        );
    }
    if (!data.isLeaf && data.changeCounts) {
        const { added, modified, deleted } = data.changeCounts;
        const hasCounts = added > 0 || modified > 0 || deleted > 0;
        if (!hasCounts) {
            return <span style={{ userSelect: "none" }}>{nodeData.title?.toString()}</span>;
        }

        // Yes, I am aware of the edge case. This is good enough for now and works 80% of the time.
        const folderStyle = added === 0 && modified === 0
            ? { color: statusColorsHex.deleted }
            : {};

        return (
            <Flex align="center" gap={6} style={{ minWidth: 0, width: "100%" }}>
                <span style={{ ...ellipsisStyle, ...folderStyle, flex: 1 }}>{nodeData.title?.toString()}</span>
                <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
                    {added > 0 && (
                        <Flex align="center" gap={3}>
                            <span style={{ ...statusIconStyle, color: statusColorsHex.added }}>{statusIcons.added}</span>
                            <span style={{ ...packageCountStyle, color: statusColorsHex.added }}>{added}</span>
                        </Flex>
                    )}
                    {modified > 0 && (
                        <Flex align="center" gap={3}>
                            <span style={{ ...statusIconStyle, color: statusColorsHex.modified }}>{statusIcons.modified}</span>
                            <span style={{ ...packageCountStyle, color: statusColorsHex.modified }}>{modified}</span>
                        </Flex>
                    )}
                    {deleted > 0 && (
                        <Flex align="center" gap={3}>
                            <span style={{ ...statusIconStyle, color: statusColorsHex.deleted }}>{statusIcons.deleted}</span>
                            <span style={{ ...packageCountStyle, color: statusColorsHex.deleted }}>{deleted}</span>
                        </Flex>
                    )}
                </Flex>
            </Flex>
        );
    }
    return <span style={{ userSelect: "none" }}>{nodeData.title?.toString()}</span>;
};

function buildDiffTree(entries: DiffEntry[]): TreeDataNode[] {
    const dirs = new Map<string, DiffTreeNodeData[]>();
    dirs.set("", []);

    for (const entry of entries) {
        const file = withoutClassExtension(entry.file);
        const parts = file.split("/");
        const fileName = parts.at(-1) || file;
        const dirPath = parts.slice(0, -1).join("/");

        if (dirPath === "") {
            dirs.get("")!.push({
                title: fileName,
                key: entry.file,
                isLeaf: true,
                icon: <JavaIcon style={{ fontSize: "16px" }} />,
                statusInfo: entry.statusInfo,
                filePath: entry.file,
            });
            continue;
        }

        const dirParts = dirPath.split("/");
        dirParts.forEach((_, i) => {
            const parent = dirParts.slice(0, i).join("/");
            const current = dirParts.slice(0, i + 1).join("/");
            if (!dirs.has(current)) {
                dirs.set(current, []);
                if (!dirs.has(parent)) {
                    dirs.set(parent, []);
                }
                const title = dirParts[i];
                dirs.get(parent)!.push({
                    title,
                    key: current,
                    icon: <PackageIcon style={{ fontSize: "16px" }} />,
                    children: [],
                    isLeaf: false,
                });
            }
        });

        if (!dirs.has(dirPath)) {
            dirs.set(dirPath, []);
            const parentPath = dirParts.slice(0, -1).join("/");
            dirs.get(parentPath)?.push({
                title: dirParts[dirParts.length - 1],
                key: dirPath,
                icon: <PackageIcon style={{ fontSize: "16px" }} />,
                children: [],
                isLeaf: false,
            });
        }

        dirs.get(dirPath)!.push({
            title: fileName,
            key: entry.file,
            isLeaf: true,
            icon: <JavaIcon style={{ fontSize: "16px" }} />,
            statusInfo: entry.statusInfo,
            filePath: entry.file,
        });
    }

    function countChanges(node: DiffTreeNodeData): { added: number; modified: number; deleted: number; } {
        if (node.isLeaf && node.statusInfo) {
            return { added: 0, modified: 0, deleted: 0, [node.statusInfo.state]: 1 } as any;
        }
        const counts = { added: 0, modified: 0, deleted: 0 };
        if (node.children) {
            for (const child of node.children) {
                const c = countChanges(child as DiffTreeNodeData);
                counts.added += c.added;
                counts.modified += c.modified;
                counts.deleted += c.deleted;
            }
        }
        node.changeCounts = counts;
        return counts;
    }

    function traverse(dir: string, parent: DiffTreeNodeData) {
        const nodes = dirs.get(dir);
        if (!nodes) return;

        for (const node of nodes) {
            const nodeCopy = { ...node };
            parent.children = parent.children || [];
            parent.children.push(nodeCopy);
            if (!nodeCopy.isLeaf && nodeCopy.key) {
                traverse(nodeCopy.key as string, nodeCopy);
            }
        }

        if (parent.children) {
            parent.children.sort((a, b) => {
                if (a.isLeaf && !b.isLeaf) return 1;
                if (!a.isLeaf && b.isLeaf) return -1;
                const at = a.title?.toString() || "";
                const bt = b.title?.toString() || "";
                return at.localeCompare(bt);
            });
        }
    }

    const root: DiffTreeNodeData[] = [];
    traverse("", { title: "", key: "", children: root } as DiffTreeNodeData);

    for (const child of root) {
        countChanges(child);
    }

    return root;
}

const DiffLineCounts = ({ info }: { info: ChangeInfo; }) => {
    if (info.state === "modified" && info.additions === 0 && info.deletions === 0) {
        return <span style={noLineChangesStyle}>No line changes</span>;
    }

    return (
        <span style={lineCountsStyle}>
            {info.additions !== undefined && info.additions > 0 && (
                <span style={addedStyle}>+{info.additions}</span>
            )}
            {info.deletions !== undefined && info.deletions > 0 && (
                <span style={deletedStyle}>-{info.deletions}</span>
            )}
        </span>
    );
};

const DiffLineCountsTree = ({ info, compact = false }: { info: ChangeInfo; compact?: boolean; }) => {
    if (info.state === "modified" && info.additions === 0 && info.deletions === 0) {
        if (compact) return null;
        return <span style={noLineChangesStyle}>No line changes</span>;
    }

    if (compact) {
        return (
            <span style={compactLineCountsStyle}>
                {info.additions !== undefined && info.additions > 0 && (
                    <span style={addedStyle}>+{info.additions}</span>
                )}
                {info.deletions !== undefined && info.deletions > 0 && (
                    <span style={deletedStyle}>-{info.deletions}</span>
                )}
            </span>
        );
    }

    return (
        <span style={lineCountsStyle}>
            {info.additions !== undefined && info.additions > 0 && (
                <span style={addedStyle}>+{info.additions}</span>
            )}
            {info.deletions !== undefined && info.deletions > 0 && (
                <span style={deletedStyle}>-{info.deletions}</span>
            )}
        </span>
    );
};

const fileRowStyle: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: 8,
    alignItems: "center",
    width: "100%",
    minHeight: 38,
    padding: "4px 8px",
    border: "1px solid transparent",
    borderRadius: 6,
    color: "inherit",
    font: "inherit",
    textAlign: "left"
};

const fileTextStyle: CSSProperties = {
    minWidth: 0
};

const ellipsisStyle: CSSProperties = {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
};

const fileNameStyle: CSSProperties = {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    lineHeight: 1.25
};

const filePathStyle: CSSProperties = {
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--ant-color-text-tertiary)",
    fontFamily: "var(--ant-font-family-code)",
    fontSize: 11,
    lineHeight: 1.25
};

const fileMetaStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2
};

const statusStyle: CSSProperties = {
    fontSize: 11,
    lineHeight: 1,
    textTransform: "capitalize"
};

const statusIconStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    lineHeight: 1,
    flexShrink: 0
};

const packageCountStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    flexShrink: 0
};

const lineCountsStyle: CSSProperties = {
    display: "flex",
    gap: 6,
    fontSize: 12,
    fontWeight: 650,
    lineHeight: 1
};

const compactLineCountsStyle: CSSProperties = {
    display: "flex",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    lineHeight: 1,
    flexShrink: 0
};

const addedStyle: CSSProperties = {
    color: "var(--ant-color-success)"
};

const deletedStyle: CSSProperties = {
    color: "var(--ant-color-error)"
};

const noLineChangesStyle: CSSProperties = {
    color: "var(--ant-color-text-tertiary)",
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: "nowrap"
};

export default DiffViewFileList;