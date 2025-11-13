import { Splitter } from "antd";
import { useState } from "react";
import DiffFileList from "./DiffFileList";
import DiffCode from "./DiffCode";
import { FilepathHeader } from "../FilepathHeader";

const DiffView = () => {
    const [sizes, setSizes] = useState<(number | string)[]>(['70%', '30%']);
    return (
        <>
            <FilepathHeader />
            <Splitter layout="vertical" onResize={setSizes} style={{ height: "100vh" }}>
                <Splitter.Panel min="5%" size={sizes[0]} style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {/*
                    <DiffEditor/> does not allow setting various css properties and only accepts a height
                    literal, so we pass the expected size from the view to the editor to ensure it fits in the
                    viewport correctly
                    */}
                        <DiffCode height={sizes[0]} />
                    </div>
                </Splitter.Panel>
                <Splitter.Panel
                    size={sizes[1]}
                    min="7%"
                    max="50%"
                    className={"webkit-scrollbar-hide"}
                    style={{
                        overflow: 'auto',
                        scrollbarWidth: "none"
                    }}
                >
                    <DiffFileList />
                </Splitter.Panel>
            </Splitter>
        </>
    );
};

export default DiffView;