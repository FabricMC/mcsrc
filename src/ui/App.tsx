import { Button, ConfigProvider, Drawer, Flex, Splitter, theme } from 'antd';
import Code from "./Code.tsx";
import SideBar from './SideBar.tsx';
import { useEffect, useState } from 'react';
import { useObservable } from '../utils/UseObservable.ts';
import { isDarkMode, isThin } from '../logic/Browser.ts';
import { diffView, mobileDrawerOpen, openTab, openTabs, selectedFile } from '../logic/State';
import DiffView from './diff/DiffView.tsx';
import { FilepathHeader } from './FilepathHeader.tsx';
import { enableTabs, theme as themeSetting } from '../logic/Settings.ts';
import { MenuFoldOutlined } from '@ant-design/icons';
import { TabsComponent } from './TabsComponent.tsx';
import Modals from './Modals.tsx';
import { EmptyState } from './EmptyState.tsx';
import { CodeTab, InheritanceViewTab } from '../logic/tabs';
import { InheritanceView } from './inheritance/InheritanceView.tsx';

const App = () => {
    const darkMode = useObservable(isDarkMode);
    const isSmall = useObservable(isThin);
    const enableDiff = useObservable(diffView);
    const themeMode = useObservable(themeSetting.observable);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', themeMode);
    }, [themeMode]);

    return (
        <ConfigProvider
            theme={{
                algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
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

const MainView = () => {
    const tabs = useObservable(openTabs);
    const currentTab = useObservable(openTab);

    if (!tabs || tabs.length == 0) return <EmptyState />;

    if (currentTab instanceof CodeTab) return <Code />;
    else if (currentTab instanceof InheritanceViewTab) return <InheritanceView tab={currentTab} />;
    else return <EmptyState />;
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
                <Flex vertical style={{ height: "100%", overflow: "hidden", }}>
                    {tabsEnabled && <TabsComponent />}
                    <FilepathHeader />
                    <div style={{ height: "100%" }}>
                        <MainView />
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
                <MainView />
            </div>
        </Flex>
    );
};


export default App;
