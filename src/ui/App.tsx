import { Button, ConfigProvider, Drawer, Flex, Splitter, theme } from 'antd';
import Code from "./Code.tsx";
import SideBar from './SideBar.tsx';
import { useEffect, useState } from 'react';
import { useObservable } from '../utils/UseObservable.ts';
import { isThin } from '../logic/Browser.ts';
import { diffView, mobileDrawerOpen, openTabs, selectedFile } from '../logic/State';
import DiffView from './diff/DiffView.tsx';
import { FilepathHeader } from './FilepathHeader.tsx';
import { enableTabs } from '../logic/Settings.ts';
import { MenuFoldOutlined } from '@ant-design/icons';
import { TabsComponent } from './TabsComponent.tsx';
import Modals from './Modals.tsx';
import { EmptyState } from './EmptyState.tsx';

const App = () => {
    const isSmall = useObservable(isThin);
    const enableDiff = useObservable(diffView);

    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                components: {
                    Card: {
                        bodyPadding: 4,
                    },
                    Tabs: {
                        horizontalMargin: "0",
                    }
                },
            }}
        >
            <Modals />
            {enableDiff ? <DiffView /> : isSmall ? <MobileApp /> : <LargeApp />}
        </ConfigProvider>
    );
};

const CodeOrEmpty = () => {
    const tabs = useObservable(openTabs);
    return tabs && tabs.length > 0 ? <Code /> : <EmptyState />;
};

const LargeApp = () => {
    const [sizes, setSizes] = useState<(number | string)[]>(['25%', '75%']);
    const tabsEnabled = useObservable(enableTabs.observable);

    return (
        <Splitter onResize={setSizes}>
            <Splitter.Panel collapsible defaultSize="200px" min="5%" size={sizes[0]} style={{ height: '100%' }}>
                <SideBar />
            </Splitter.Panel>
            <Splitter.Panel size={sizes[1]}>
                <Flex vertical style={{ height: "100%" }}>
                    {tabsEnabled && <TabsComponent />}
                    <FilepathHeader />
                    <div style={{ flexGrow: 1 }}>
                        <CodeOrEmpty />
                    </div>
                </Flex>
            </Splitter.Panel>
        </Splitter>
    );
};

const MobileApp = () => {
    const open = useObservable(mobileDrawerOpen);
    const tabsEnabled = useObservable(enableTabs.observable);
    const currentFile = useObservable(selectedFile);

    const showDrawer = () => {
        mobileDrawerOpen.next(true);
    };

    const onClose = () => {
        mobileDrawerOpen.next(false);
    };

    useEffect(() => {
        mobileDrawerOpen.next(false);
    }, [currentFile]);

    return (
        <Flex vertical style={{ height: "100%" }}>
            <Drawer
                onClose={onClose}
                open={open}
                placement='left'
                styles={{ body: { padding: 0 } }}
                closeIcon={false}
            >
                <SideBar />
            </Drawer>
            <Flex>
                <Button
                    size="large"
                    type="primary"
                    onClick={showDrawer}
                    icon={<MenuFoldOutlined />}
                    style={{
                        flexShrink: 0,
                        margin: ".5rem .5rem .5rem 1.5rem"
                    }}
                />
                {tabsEnabled &&
                    <span style={{ overflowX: "auto" }}> <TabsComponent /> </span>
                }
            </Flex>
            <FilepathHeader />
            <div style={{ flexGrow: 1, overflow: "auto" }}>
                <CodeOrEmpty />
            </div>
        </Flex>
    );
};


export default App;
