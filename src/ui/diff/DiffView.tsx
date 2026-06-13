import {
    AlignLeftOutlined,
    CodeOutlined,
    DownOutlined,
    FileTextOutlined,
    MenuFoldOutlined,
    SplitCellsOutlined,
    UpOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Flex, Splitter, Tooltip, Typography } from "antd";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { isThin } from "../../logic/Browser";
import {
    getDiffChanges,
    getDiffSummary,
    type DiffSummary,
} from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler";
import { bytecode, unifiedDiff } from "../../logic/Settings";
import { diffView, selectedFile } from "../../logic/State";
import { openCodeTab } from "../../logic/tabs";
import { useObservable } from "../../utils/UseObservable";
import { FilepathHeader } from "../FilepathHeader";
import DiffCode from "./DiffCode";
import {
    jumpWithinCurrentFile,
    pendingDiffJump,
    type DiffDirection
} from "./DiffNavigation";
import DiffViewFileList from "./DiffViewFileList";
import DiffVersionSelection from "./DiffVersionSelection";

const { Text, Title } = Typography;

const DiffView = () => {
    const isSmall = useObservable(isThin);

    if (isSmall) {
        return <MobileDiffView />;
    }

    return <DesktopDiffView />;
};

const DesktopDiffView = () => {
    return (
        <Splitter className="diff-shell">
            <Splitter.Panel
                defaultSize={320}
                min={260}
                max={420}
                className="diff-sidebar-panel"
            >
                <DiffSidebar />
            </Splitter.Panel>
            <Splitter.Panel className="diff-editor-panel">
                <DiffMainPane />
            </Splitter.Panel>
        </Splitter>
    );
};

const MobileDiffView = () => {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const currentFile = useObservable(selectedFile);

    useEffect(() => {
        setDrawerOpen(false);
    }, [currentFile]);

    return (
        <Flex vertical style={{ height: "100%", minHeight: 0 }}>
            <Flex align="center" gap={8} style={{ padding: 8 }} wrap={false}>
                <Button
                    type="primary"
                    icon={<MenuFoldOutlined />}
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Open changed files"
                />
                <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
                    <DiffVersionSelection />
                </div>
            </Flex>
            <Drawer
                onClose={() => setDrawerOpen(false)}
                open={drawerOpen}
                placement="left"
                closeIcon={false}
                size="min(92vw, 380px)"
                styles={{ body: { padding: 0 } }}
            >
                <DiffSidebar />
            </Drawer>
            <DiffMainPane />
        </Flex>
    );
};

const DiffSidebar = () => {
    const summary = useObservable<DiffSummary>(useMemo(() => getDiffSummary(), []));

    return (
        <aside style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <Flex vertical gap={10} style={{ padding: 12 }}>
                <Flex justify="space-between" align="center" gap={8}>
                    <div>
                        <Title level={5} style={{ margin: 0 }}>Compare</Title>
                        <DiffSummaryLine summary={summary} />
                    </div>
                    <Button onClick={() => diffView.next(false)}>Exit</Button>
                </Flex>
                <div style={{ overflowX: "auto" }}>
                    <DiffVersionSelection />
                </div>
                <DiffActions />
            </Flex>
            <DiffViewFileList />
        </aside>
    );
};

const DiffSummaryLine = ({ summary }: { summary?: DiffSummary }) => {
    if (!summary) {
        return <Text type="secondary">Loading changes...</Text>;
    }

    if (summary.added === 0 && summary.deleted === 0 && summary.modified === 0) {
        return <Text type="secondary">No changed files</Text>;
    }

    return (
        <Flex gap={8} wrap>
            <Text type="success" strong>+{summary.added}</Text>
            <Text type="danger" strong>-{summary.deleted}</Text>
            <Text type="secondary">{summary.modified} modified</Text>
        </Flex>
    );
};

const DiffActions = () => {
    const isUnifiedDiff = useObservable(unifiedDiff.observable);
    const isBytecode = useObservable(bytecode.observable);
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const changes = useObservable(useMemo(() => getDiffChanges(), []));
    const changedFiles = useMemo(() => changes ? [...changes.keys()] : [], [changes]);
    const currentChange = currentFile ? changes?.get(currentFile) : undefined;
    const hasNoLineChanges = currentChange?.state === "modified"
        && currentChange.additions === 0
        && currentChange.deletions === 0;

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
        <Flex gap={6} justify="center" wrap={false}>
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
            <Tooltip title={isUnifiedDiff ? "Switch to side-by-side diff" : "Switch to unified diff"}>
                <Button
                    type={isUnifiedDiff ? "primary" : "default"}
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
        </Flex>
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

const DiffMainPane = () => {
    return (
        <Flex vertical style={{ flex: 1, height: "100%", minHeight: 0 }}>
            <FilepathHeader />
            <div className="diff-code-frame">
                <DiffCode />
            </div>
        </Flex>
    );
};

export default DiffView;
