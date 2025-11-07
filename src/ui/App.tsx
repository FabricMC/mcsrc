
import { ConfigProvider, Splitter, theme } from 'antd';
import Code from "./Code.tsx";
import ProgressModal from './ProgressModal.tsx';
import SideBar from './Sidebar.tsx';
import { useState } from 'react';


const App = () => {
    const [sizes, setSizes] = useState<(number | string)[]>(['25%', '75%']);
    return (
        <ConfigProvider
            theme={{
                algorithm: theme.darkAlgorithm,
                components: {
                    Card: {
                        bodyPadding: 4,
                    },
                },
            }}
        >
            <ProgressModal />
            <Splitter onResize={setSizes}>
                <Splitter.Panel collapsible defaultSize="200px" min="5%" size={sizes[0]}>
                    <SideBar />
                </Splitter.Panel>
                <Splitter.Panel size={sizes[1]}>
                    <Code />
                </Splitter.Panel>
            </Splitter>
        </ConfigProvider>
    )
};


export default App