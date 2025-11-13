import { Tabs } from "antd";
import { useObservable } from "../utils/UseObservable";
import { activeTabKey, closeTab, openTab, openTabs } from "../logic/Tabs";

export const TabsComponent = () => {
    const activeKey = useObservable(activeTabKey);
    const tabs = useObservable(openTabs);

    type TargetKey = React.MouseEvent | React.KeyboardEvent | string;
    const onEdit = (targetKey: TargetKey, action: "add" | "remove") => {
        if (action === "add") return;
        if (!(typeof targetKey === "string")) return;
        closeTab(targetKey);
    };

    return (
        <Tabs
            hideAdd
            type="editable-card"
            activeKey={activeKey}
            onEdit={onEdit}
            onTabClick={(key) => openTab(key)}
            items={tabs?.map((key) => ({
                key,
                label: key.replace(".class", "").split("/").pop()
            }))}
        />
    );
};