
import { ConfigProvider, Splitter, theme } from 'antd';
import Code from "./Code.tsx";
import ProgressModal from './ProgressModal.tsx';
import SideBar from './Sidebar.tsx';


const App = () => (
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
        <Splitter>
            <Splitter.Panel collapsible defaultSize="200px" min="5%">
                <SideBar />
            </Splitter.Panel>
            <Splitter.Panel>
                <Code />
            </Splitter.Panel>
        </Splitter>
    </ConfigProvider>
);


export default App