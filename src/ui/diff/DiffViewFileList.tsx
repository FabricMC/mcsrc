import { Empty, Input, Tag, theme } from "antd";
import type { SearchProps } from "antd/es/input";
import { BehaviorSubject, combineLatest, map } from "rxjs";
import {
    getDiffChanges,
    type ChangeInfo,
    type ChangeState,
} from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler";
import { selectedFile } from "../../logic/State";
import { openCodeTab } from "../../logic/tabs";
import { useObservable } from "../../utils/UseObservable";

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
        const lowerQuery = query.toLowerCase();
        const nextEntries: DiffEntry[] = [];

        changesMap.forEach((info, file) => {
            if (!query || file.toLowerCase().includes(lowerQuery)) {
                nextEntries.push({
                    key: file,
                    file,
                    statusInfo: info,
                });
            }
        });

        return nextEntries;
    })
);

const DiffViewFileList = () => {
    const onChange: SearchProps["onChange"] = (event) => {
        searchQuery.next(event.target.value);
    };

    return (
        <div className="diff-file-list-shell">
            <div className="diff-file-search">
                <Input.Search
                    allowClear
                    placeholder="Search"
                    aria-label="Search changed files"
                    onChange={onChange}
                />
            </div>
            <div className="diff-sidebar-divider" />
            <DiffChangedFiles />
        </div>
    );
};

const DiffChangedFiles = () => {
    const dataSource = useObservable(entries) || [];
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);

    if (dataSource.length === 0) {
        return (
            <div className="diff-empty">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No changed files" />
            </div>
        );
    }

    return (
        <div className="diff-file-list" role="list" aria-label="Changed files">
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

const DiffFileRow = ({ entry, selected, disabled }: DiffFileRowProps) => {
    const { token } = theme.useToken();
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
                openCodeTab(entry.file);
            }}
        >
            <div className="diff-file-row-main">
                <span className="diff-file-name" style={{ color: token.colorText }}>{name}</span>
                {path && <span className="diff-file-path">{path}</span>}
            </div>
            <div className="diff-file-meta">
                <Tag color={statusColors[entry.statusInfo.state] || "default"} className="diff-status-tag">
                    {entry.statusInfo.state}
                </Tag>
                <DiffLineCounts info={entry.statusInfo} />
            </div>
        </button>
    );
};

const DiffLineCounts = ({ info }: { info: ChangeInfo }) => {
    if (info.state === "modified" && info.additions === 0 && info.deletions === 0) {
        return <span className="diff-no-line-count">No line changes</span>;
    }

    return (
        <span className="diff-line-counts">
            {info.additions !== undefined && info.additions > 0 && (
                <span className="diff-summary-added">+{info.additions}</span>
            )}
            {info.deletions !== undefined && info.deletions > 0 && (
                <span className="diff-summary-deleted">-{info.deletions}</span>
            )}
        </span>
    );
};

export default DiffViewFileList;
