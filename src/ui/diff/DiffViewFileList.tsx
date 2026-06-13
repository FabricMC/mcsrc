import { type CSSProperties, memo } from "react";
import { Divider, Empty, Flex, Input } from "antd";
import type { SearchProps } from "antd/es/input";
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

const statusColors: Record<ChangeState, string> = {
    modified: "gold",
    added: "green",
    deleted: "red",
};

const searchQuery = new BehaviorSubject("");

interface DiffEntry {
    key: string;
    file: string;
    statusInfo: ChangeInfo;
}

const entries = combineLatest([getDiffChanges(), searchQuery]).pipe(
    map(([changesMap, query]) => {
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

        return nextEntries;
    })
);

const DiffViewFileList = () => {
    const onChange: SearchProps["onChange"] = (event) => {
        searchQuery.next(event.target.value);
    };

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
            <DiffChangedFiles />
        </Flex>
    );
};

const DiffChangedFiles = () => {
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

interface DiffFileRowProps {
    entry: DiffEntry;
    selected: boolean;
    disabled: boolean;
}

const DiffFileRow = memo(({ entry, selected, disabled }: DiffFileRowProps) => {
    const file = entry.file.replace(".class", "");
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
                <span className="diff-file-name" style={fileNameStyle}>{name}</span>
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

const DiffLineCounts = ({ info }: { info: ChangeInfo }) => {
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
    display: "block",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
};

const fileNameStyle: CSSProperties = {
    ...ellipsisStyle,
    fontSize: 13,
    lineHeight: 1.25
};

const filePathStyle: CSSProperties = {
    ...ellipsisStyle,
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

const lineCountsStyle: CSSProperties = {
    display: "flex",
    gap: 6,
    fontSize: 12,
    fontWeight: 650,
    lineHeight: 1
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
