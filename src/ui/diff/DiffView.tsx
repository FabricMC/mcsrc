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
import { type CSSProperties, useEffect, useMemo } from "react";
import { isThin } from "../../logic/Browser";
import {
    getDiffChanges,
    getDiffSummary,
    type DiffSummary,
} from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler";
import { bytecode, unifiedDiff } from "../../logic/Settings";
import { diffView, mobileDrawerOpen, selectedFile } from "../../logic/State";
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
    const drawerOpen = useObservable(mobileDrawerOpen);
    const currentFile = useObservable(selectedFile);

    useEffect(() => {
        mobileDrawerOpen.next(false);
    }, [currentFile]);

    return (
        <Flex vertical style={{ height: "100%", minHeight: 0 }}>
            <Drawer
                onClose={() => mobileDrawerOpen.next(false)}
                open={drawerOpen}
                placement="left"
                styles={{ body: { padding: 0 } }}
                closeIcon={false}
            >
                <DiffSidebar />
            </Drawer>
            <MobileDiffHeader />
            <DiffMainPane showHeader={false} />
        </Flex>
    );
};

const MobileDiffHeader = () => {
    return (
        <Flex align="center" gap={8} style={{ padding: 8 }} wrap={false}>
            <Flex flex={1} justify="flex-start">
                <Tooltip title="Open changed files">
                    <Button
                        type="primary"
                        icon={<MenuFoldOutlined />}
                        onClick={() => mobileDrawerOpen.next(true)}
                        aria-label="Open changed files"
                    />
                </Tooltip>
            </Flex>
            <Flex gap={6} justify="center" wrap={false}>
                <DiffNavigationButtons />
            </Flex>
            <Flex flex={1} justify="flex-end">
                <Button
                    onClick={() => diffView.next(false)}
                    aria-label="Exit diff view"
                >
                    Exit
                </Button>
            </Flex>
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
    return (
        <Flex gap={6} justify="center" wrap={false}>
            <DiffNavigationButtons />
            <DiffViewModeButtons />
        </Flex>
    );
};

const DiffNavigationButtons = () => {
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const changes = useObservable(useMemo(() => getDiffChanges(), []));
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

const DiffViewModeButtons = () => {
    const isUnifiedDiff = useObservable(unifiedDiff.observable);
    const isBytecode = useObservable(bytecode.observable);
    const currentFile = useObservable(selectedFile);
    const changes = useObservable(useMemo(() => getDiffChanges(), []));
    const currentChange = currentFile ? changes?.get(currentFile) : undefined;
    const hasNoLineChanges = currentChange?.state === "modified"
        && currentChange.additions === 0
        && currentChange.deletions === 0;

    return (
        <>
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

const DiffMainPane = ({ showHeader = true }: { showHeader?: boolean }) => {
    return (
        <Flex vertical style={{ flex: 1, height: "100%", minHeight: 0 }}>
            {showHeader && <FilepathHeader />}
            <div className="diff-code-frame">
                <DiffCode />
            </div>
        </Flex>
    );
};

export default DiffView;
