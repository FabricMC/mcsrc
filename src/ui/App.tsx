import { ConfigProvider, Drawer, Flex, FloatButton, Splitter, theme } from 'antd';
import Code from "./Code.tsx";
import ProgressModal from './ProgressModal.tsx';
import SideBar from './SideBar.tsx';
import { useState } from 'react';
import { useObservable } from '../utils/UseObservable.ts';
import { isThin } from '../logic/Browser.ts';
import { MenuFoldOutlined } from '@ant-design/icons';
import { HeaderBody } from './Header.tsx';
import { diffView } from '../logic/Diff.ts';
import DiffView from './diff/DiffView.tsx';
import { TabsProvider } from './tabs/TabsProvider.tsx';

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
            <ProgressModal />
            <TabsProvider>
                {enableDiff ? <DiffView /> : isSmall ? <MobileApp /> : <LargeApp />}
            </TabsProvider>
        </ConfigProvider>
    )
};

const LargeApp = () => {
    const [sizes, setSizes] = useState<(number | string)[]>(['25%', '75%']);
    return (
        <Splitter onResize={setSizes}>
            <Splitter.Panel collapsible defaultSize="200px" min="5%" size={sizes[0]}>
                <SideBar />
            </Splitter.Panel>
            <Splitter.Panel size={sizes[1]}>
                <Code />
            </Splitter.Panel>
        </Splitter>
    )
};


const MobileApp = () => {
    const [open, setOpen] = useState(false);

    const showDrawer = () => {
        setOpen(true);
    };

    const onClose = () => {
        setOpen(false);
    };

    return (
        <Flex vertical={true}>
            <FloatButton type="primary" onClick={showDrawer} icon={<MenuFoldOutlined />} style={{ top: 24, left: 24 }} />
            <Drawer
                onClose={onClose}
                open={open}
                placement='left'
                styles={{ body: { padding: 0 } }}
                extra={<HeaderBody />}
            >
                <SideBar />
            </Drawer>
            <Code />
        </Flex>
    )
}


export default App