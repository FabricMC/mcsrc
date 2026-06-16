import {
    AlignLeftOutlined,
    CodeOutlined,
    DownOutlined,
    FileTextOutlined,
    SplitCellsOutlined,
    UpOutlined,
} from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import { type CSSProperties, useMemo } from "react";
import { getDiffChanges } from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler";
import { bytecode, unifiedDiff } from "../../logic/Settings";
import { selectedFile } from "../../logic/State";
import { openCodeTab } from "../../logic/tabs";
import { useObservable } from "../../utils/UseObservable";
import {
    jumpWithinCurrentFile,
    pendingDiffJump,
    type DiffDirection
} from "./DiffNavigation";

const diffChanges = getDiffChanges();

export const DiffNavigationButtons = () => {
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const changes = useObservable(diffChanges);
    const changedFiles = useMemo(() => changes ? [...changes.keys()] : [], [changes]);

    const jumpDiff = (direction: DiffDirection) => {
        if (jumpWithinCurrentFile(direction)) return;

        if (changedFiles.length === 0) return;

        const currentIndex = currentFile ? changedFiles.indexOf(currentFile) : -1;
        const targetIndex = currentIndex === -1
            ? direction === 1 ? 0 : changedFiles.length - 1
            : currentIndex + direction;
        const targetFile = changedFiles[targetIndex];

        if (!targetFile) return;

        pendingDiffJump.next(direction);
        openCodeTab(targetFile);
    };

    return (
        <>
            <Tooltip title="Previous diff">
                <Button
                    icon={<UpOutlined />}
                    aria-label="Previous diff"
                    disabled={loading || changedFiles.length === 0}
                    onClick={() => jumpDiff(-1)}
                />
            </Tooltip>
            <Tooltip title="Next diff">
                <Button
                    icon={<DownOutlined />}
                    aria-label="Next diff"
                    disabled={loading || changedFiles.length === 0}
                    onClick={() => jumpDiff(1)}
                />
            </Tooltip>
        </>
    );
};

export const DiffViewModeButtons = () => {
    const isUnifiedDiff = useObservable(unifiedDiff.observable);
    const isBytecode = useObservable(bytecode.observable);
    const currentFile = useObservable(selectedFile);
    const changes = useObservable(diffChanges);
    const currentChange = currentFile ? changes?.get(currentFile) : undefined;
    const hasNoLineChanges = currentChange?.state === "modified"
        && currentChange.additions === 0
        && currentChange.deletions === 0;

    return (
        <>
            <Tooltip title={isUnifiedDiff ? "Switch to side-by-side diff" : "Switch to unified diff"}>
                <Button
                    icon={isUnifiedDiff ? <SplitCellsOutlined /> : <AlignLeftOutlined />}
                    onClick={() => unifiedDiff.value = !unifiedDiff.value}
                    aria-label={isUnifiedDiff ? "Switch to side-by-side diff" : "Switch to unified diff"}
                    aria-pressed={isUnifiedDiff}
                />
            </Tooltip>
            <Tooltip title={getBytecodeTooltip(isBytecode, hasNoLineChanges)}>
                <Button
                    type={isBytecode ? "primary" : "default"}
                    icon={isBytecode ? <FileTextOutlined /> : <CodeOutlined />}
                    onClick={() => bytecode.value = !bytecode.value}
                    aria-label={isBytecode ? "Show decompiled code" : "Show bytecode"}
                    aria-pressed={isBytecode}
                    style={hasNoLineChanges ? noLineChangesBytecodeStyle : undefined}
                />
            </Tooltip>
        </>
    );
};

const noLineChangesBytecodeStyle: CSSProperties = {
    borderColor: "var(--ant-color-success)",
    boxShadow: "0 0 0 2px var(--ant-color-success-bg)",
    color: "var(--ant-color-success)"
};

function getBytecodeTooltip(isBytecode: boolean, hasNoLineChanges: boolean) {
    if (hasNoLineChanges) {
        return isBytecode
            ? "Show decompiled code. This file changed only in bytecode."
            : "Show bytecode. This file changed only in bytecode.";
    }

    return isBytecode ? "Show decompiled code" : "Show bytecode";
}
