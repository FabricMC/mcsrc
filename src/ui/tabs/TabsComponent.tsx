import { useContext } from "react"
import { Tabs } from "antd";
import { TabsContext } from "./TabsContext"
import { InternalTabsContext } from "./InternalTabsContext";

export const TabsComponent = () => {
    const { tabs, setTabs, activeKey } = useContext(InternalTabsContext);
    const { openPreviewTab, } = useContext(TabsContext);

    type TargetKey = React.MouseEvent | React.KeyboardEvent | string;
    const onEdit = (targetKey: TargetKey, action: "add" | "remove") => {
        if (action === "add") return;
        if (tabs.length <= 1) return;

        // If the currently active tab is removed, this switches to the next one to the left of it
        if (activeKey === targetKey) {
            let index = tabs.findIndex(o => o.key === activeKey) - 1;
            if (index < 0) index = 0;
            if (index > tabs.length - 1) index = tabs.length - 1;
            openPreviewTab(tabs[index].key);
        }

        setTabs(tabs.filter((tab) => tab.key !== targetKey));
    };

    return (
        <Tabs
            hideAdd
            type="editable-card"
            activeKey={activeKey}
            onEdit={onEdit}
            onTabClick={(key) => openPreviewTab(key)}
            items={tabs.map((tab) => ({
                key: tab.key,
                label: <span style={
                    !tab.persistent ? { fontStyle: "italic" } : {}
                }> {tab.key.replace(".class", "").split("/").pop()} </span>
            }))}
        />
    )
}