import {
    AlignLeftOutlined,
    CodeOutlined,
    DownOutlined,
    FileTextOutlined,
    MenuFoldOutlined,
    SplitCellsOutlined,
    UpOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Flex, Splitter, Tooltip } from "antd";
import { useEffect, useMemo, useState } from "react";
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
        <Flex vertical className="diff-mobile-shell">
            <div className="diff-mobile-bar">
                <Button
                    type="primary"
                    icon={<MenuFoldOutlined />}
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Open changed files"
                />
                <div className="diff-mobile-version-strip">
                    <DiffVersionSelection />
                </div>
            </div>
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
        <aside className="diff-sidebar">
            <div className="diff-sidebar-header">
                <Flex justify="space-between" align="center" gap={8}>
                    <div>
                        <div className="diff-title">Compare</div>
                        <DiffSummaryLine summary={summary} />
                    </div>
                    <Button onClick={() => diffView.next(false)}>Exit</Button>
                </Flex>
                <div className="diff-version-card">
                    <DiffVersionSelection />
                </div>
                <DiffActions />
            </div>
            <DiffViewFileList />
        </aside>
    );
};

const DiffSummaryLine = ({ summary }: { summary?: DiffSummary }) => {
    if (!summary) {
        return <div className="diff-summary">Loading changes...</div>;
    }

    if (summary.added === 0 && summary.deleted === 0 && summary.modified === 0) {
        return <div className="diff-summary">No changed files</div>;
    }

    return (
        <div className="diff-summary">
            <span className="diff-summary-added">+{summary.added}</span>
            <span className="diff-summary-deleted">-{summary.deleted}</span>
            <span>{summary.modified} modified</span>
        </div>
    );
};

const DiffActions = () => {
    const isUnifiedDiff = useObservable(unifiedDiff.observable);
    const isBytecode = useObservable(bytecode.observable);
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
        <div className="diff-action-grid">
            <Tooltip title="Previous diff">
                <Button
                    icon={<UpOutlined />}
                    aria-label="Previous diff"
                    disabled={loading || changedFiles.length === 0}
                    onClick={() => jumpDiff(-1)}
                >
                    Previous
                </Button>
            </Tooltip>
            <Tooltip title="Next diff">
                <Button
                    icon={<DownOutlined />}
                    aria-label="Next diff"
                    disabled={loading || changedFiles.length === 0}
                    onClick={() => jumpDiff(1)}
                >
                    Next
                </Button>
            </Tooltip>
            <Tooltip title={isUnifiedDiff ? "Switch to side-by-side diff" : "Switch to unified diff"}>
                <Button
                    icon={isUnifiedDiff ? <SplitCellsOutlined /> : <AlignLeftOutlined />}
                    onClick={() => unifiedDiff.value = !unifiedDiff.value}
                >
                    {isUnifiedDiff ? "Side-by-side" : "Unified"}
                </Button>
            </Tooltip>
            <Tooltip title={isBytecode ? "Show decompiled code" : "Show bytecode"}>
                <Button
                    icon={isBytecode ? <FileTextOutlined /> : <CodeOutlined />}
                    onClick={() => bytecode.value = !bytecode.value}
                >
                    {isBytecode ? "Source" : "Bytecode"}
                </Button>
            </Tooltip>
        </div>
    );
};

const DiffMainPane = () => {
    return (
        <Flex vertical className="diff-main-pane">
            <FilepathHeader />
            <div className="diff-code-frame">
                <DiffCode />
            </div>
        </Flex>
    );
};

export default DiffView;
