import { Splitter } from "antd";
import { useState } from "react";
import DiffFileList from "./DiffFileList";
import DiffCode from "./DiffCode";

const DiffView = () => {
    const [sizes, setSizes] = useState<(number | string)[]>(['70%', '30%']);
    // TODO fix resize as idk how to make it fit on the window.
    return (
        <Splitter layout="vertical" onResize={setSizes}>
            <Splitter.Panel min="5%" size={sizes[0]} style={{ overflow: 'hidden' }}>
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <DiffCode />
                </div>
            </Splitter.Panel>
            <Splitter.Panel size={sizes[1]} style={{ overflow: 'auto', maxHeight: "30vh" }} resizable={false}>
                <DiffFileList />
            </Splitter.Panel>
        </Splitter>
    )
};

export default DiffView;