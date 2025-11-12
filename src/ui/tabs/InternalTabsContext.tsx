import { createContext } from "react";

export interface Tab {
    key: string,
    persistent: boolean
}

interface InternalTabsContextType {
    tabs: Tab[];
    setTabs: (tabs: Tab[]) => void;
    activeKey: string;
    setActiveKey: (key: string) => void;
}

export const InternalTabsContext = createContext<InternalTabsContextType>({
    tabs: [],
    setTabs: () => { },
    activeKey: "",
    setActiveKey: () => { },
});