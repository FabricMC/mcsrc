import { Splitter } from "antd";
import { useState } from "react";
import DiffFileList from "./DiffFileList";
import DiffCode from "./DiffCode";
import { FilepathHeader } from "../FilepathHeader";

const DiffView = () => {
  const [sizes, setSizes] = useState<(number | string)[]>(["70%", "30%"]);
  return (
    <>
      <FilepathHeader />
      <Splitter vertical onResize={setSizes} style={{ height: "calc(100vh - 26px)" }}>
        <Splitter.Panel min="5%" size={sizes[0]} style={{ overflow: "hidden" }}>
          <DiffCode />
        </Splitter.Panel>
        <Splitter.Panel
          size={sizes[1]}
          min="7%"
          max="50%"
          className={"webkit-scrollbar-hide"}
          style={{
            overflow: "auto",
            scrollbarWidth: "none",
          }}
        >
          <DiffFileList />
        </Splitter.Panel>
      </Splitter>
    </>
  );
};

export default DiffView;
