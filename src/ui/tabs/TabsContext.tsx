import { createContext } from "react";

interface TabsContextType {
    openPersistentTab: (path: string) => void;
    openPreviewTab: (path: string) => void;
};

export const TabsContext = createContext<TabsContextType>({
    openPersistentTab() { },
    openPreviewTab() { },
});
