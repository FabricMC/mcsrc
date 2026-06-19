import { MenuFoldOutlined } from "@ant-design/icons";
import { Button, Drawer, Empty, Flex, Splitter, Tooltip, Typography } from "antd";
import { useEffect } from "react";
import { skip } from "rxjs";
import { isThin } from "../../logic/Browser";
import {
    getDiffSummary,
    type DiffSummary,
} from "../../logic/Diff";
import { diffView, mobileDrawerOpen, selectedFile } from "../../logic/State";
import { useObservable } from "../../utils/UseObservable";
import { FilepathHeader } from "../FilepathHeader";
import DiffCode from "./DiffCode";
import { DiffNavigationButtons, DiffViewModeButtons } from "./DiffViewActions";
import DiffViewFileList from "./DiffViewFileList";
import DiffVersionSelection from "./DiffVersionSelection";

const { Text, Title } = Typography;
const diffSummary = getDiffSummary();

const closeMobileDrawer = () => mobileDrawerOpen.next(false);
const openMobileDrawer = () => mobileDrawerOpen.next(true);
const exitDiffView = () => diffView.next(false);

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
                defaultSize={340}
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

    useEffect(() => {
        openMobileDrawer();

        const subscription = selectedFile.pipe(skip(1)).subscribe(() => {
            closeMobileDrawer();
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <Flex vertical style={{ height: "100%", minHeight: 0 }}>
            <Drawer
                onClose={closeMobileDrawer}
                open={drawerOpen}
                placement="left"
                styles={{ body: { padding: 0 } }}
                closeIcon={false}
            >
                <DiffSidebar closeAction="close" />
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
                        onClick={openMobileDrawer}
                        aria-label="Open changed files"
                    />
                </Tooltip>
            </Flex>
            <Flex gap={6} justify="center" wrap={false}>
                <DiffNavigationButtons />
            </Flex>
            <Flex flex={1} justify="flex-end">
                <Button
                    danger
                    onClick={exitDiffView}
                    aria-label="Exit diff view"
                >
                    Exit
                </Button>
            </Flex>
        </Flex>
    );
};

type SidebarCloseAction = "close" | "exit";

const DiffSidebar = ({ closeAction = "exit" }: { closeAction?: SidebarCloseAction }) => {
    const summary = useObservable<DiffSummary>(diffSummary);

    return (
        <aside style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <Flex vertical gap={10} style={{ padding: 12 }}>
                <Flex justify="space-between" align="center" gap={8}>
                    <div>
                        <Title level={5} style={{ margin: 0 }}>Compare</Title>
                        <DiffSummaryLine summary={summary} />
                    </div>
                    <DiffSidebarCloseButton action={closeAction} />
                </Flex>
                <div style={{ display: "flex", justifyContent: "center", overflowX: "hidden" }}>
                    <DiffVersionSelection />
                </div>
                <DiffActions />
            </Flex>
            <DiffViewFileList />
        </aside>
    );
};

const DiffSidebarCloseButton = ({ action }: { action: SidebarCloseAction }) => {
    const isExitAction = action === "exit";

    return (
        <Button
            danger={isExitAction}
            onClick={isExitAction ? exitDiffView : closeMobileDrawer}
        >
            {isExitAction ? "Exit" : "Close"}
        </Button>
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

const DiffMainPane = ({ showHeader = true }: { showHeader?: boolean }) => {
    const currentFile = useObservable(selectedFile);

    return (
        <Flex vertical style={{ flex: 1, height: "100%", minHeight: 0 }}>
            {showHeader && <FilepathHeader />}
            <div className="diff-code-frame">
                {currentFile ? <DiffCode /> : <DiffPlaceholder />}
            </div>
        </Flex>
    );
};

const DiffPlaceholder = () => (
    <Flex align="center" justify="center" style={{ height: "100%" }}>
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Select a file"
        />
    </Flex>
);

export default DiffView;
