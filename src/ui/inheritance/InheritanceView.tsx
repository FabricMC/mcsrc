import { useObservable } from "../../utils/UseObservable";
import { selectedInheritanceClassNode } from "../../logic/Inheritance";
import { lazy } from "react";
import type { InheritanceViewTab } from "../../logic/Tabs";
import { Tabs } from "antd";

const InheritanceTree = lazy(() => import("./InheritanceTree"));
const InheritanceGraph = lazy(() => import("./InheritanceGraph"));

export const InheritanceView = ({ tab }: { tab: InheritanceViewTab; }) => {
    const data = useObservable(selectedInheritanceClassNode);
    if (data == null) return null;

    const items = [{
        key: "tree",
        label: "Tree",
        children: <InheritanceTree tab={tab} data={data} />,
    }, {
        key: "graph",
        label: "Graph",
        children: <InheritanceGraph tab={tab} data={data} />,
    }];

    return (
        <div style={{
            width: "100%",
            height: "100%",
        }}>
            <Tabs
                defaultActiveKey={tab.innerTabs.active}
                key={tab.innerTabs.active}
                onChange={(key) => tab.innerTabs.active = key}
                items={items}
                centered
            />
        </div>
    );
};