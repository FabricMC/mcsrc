import React, { useEffect, useState } from "react"
import { setSelectedFile, state } from "../../logic/State";
import { TabsContext } from "./TabsContext";
import { InternalTabsContext, type Tab } from "./InternalTabsContext";

export const TabsProvider = ({ children }: { children: React.ReactNode }) => {
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [activeKey, setActiveKey] = useState<string>("");

    /**
     * Updates the active tab key state and the selected file if the is about to change
     * 
     * @param key - the new tab key (being the path)
     */
    const updateActiveState = (key: string) => {
        if (key !== activeKey) {
            setActiveKey(key);
            setSelectedFile(key);
        }
    };

    /**
     * Checks if the tab we are trying to open is already open. If that's the case,
     * we check if we should upgrade the already opened tab to be persistent, depending on the
     * `persistent` flag.
     * 
     * @param key - tab key
     * @param persistent - persistence flag
     * @returns A modified tab array if it changed, null if it didn't
     */
    const handleAlreadyOpenTab = (key: string, persistent: boolean) => {
        const tab = tabs.find(t => t.key === key);
        if (!tab) return null;

        if (!persistent) return tabs;

        return tabs.map(t => t.key === key ? { ...t, persistent: true } : t);
    };

    /**
     * Replaces the preview tab with a new one if one is already open.
     * 
     * @param key 
     * @param activeKey 
     * @returns A modified tab array if it changed, null if it didn't
     */
    const replaceActivePreview = (key: string, activeKey: string) => {
        const index = tabs.findIndex(t => t.key === activeKey && !t.persistent);
        if (index === -1) return null;

        const newTabs = [...tabs];
        newTabs[index] = { key, persistent: false };
        return newTabs;
    };

    /**
     * Inserts a new tab after the currently active tab.
     * All previously existing preview tabs are removed in the process.
     * 
     * @param key 
     * @param activeKey 
     * @returns A modified tab array with the new tab inserted
     */
    const insertAfterActive = (key: string, activeKey: string) => {
        const newTab = { key, persistent: false };
        const filtered = tabs.filter(t => t.persistent);
        const index = filtered.findIndex(t => t.key === activeKey);
        if (index === -1) return [...filtered, newTab];

        const newTabs = [...filtered];
        newTabs.splice(index + 1, 0, newTab);
        return newTabs;
    };


    /**
     * Internal method handling all the cases
     * 
     * @param key - key (path) of the new tab
     * @param persistent - flag which decides whether this tab should be persistent or not
     */
    const tabOpen = (key: string, persistent: boolean) => {
        setTabs(() => {
            updateActiveState(key);

            const alreadyOpen = handleAlreadyOpenTab(key, persistent);
            if (alreadyOpen) return alreadyOpen;

            const replaced = replaceActivePreview(key, activeKey);
            if (replaced) return replaced;

            return insertAfterActive(key, activeKey);
        });
    }

    /**
     * Opens a new or pre-existing persistent tab
     * 
     * @param key - the new tab's unique key (path)
     */
    const openPersistentTab = (key: string) => {
        tabOpen(key, true);
    };

    /**
     * Opens a new or pre-existing preview tab
     * 
     * @param key - the new tab's unique key (path)
     */
    const openPreviewTab = (key: string) => {
        tabOpen(key, false)
    }

    /**
     * Gets the initial file and sets the initial tab
     */
    useEffect(() => {
        const initialFile = state.value.file;
        if (initialFile) openPersistentTab(initialFile);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <InternalTabsContext.Provider
            value={{ tabs, setTabs, activeKey, setActiveKey }}
        >
            <TabsContext.Provider value={{ openPreviewTab, openPersistentTab }}>
                {children}
            </TabsContext.Provider>
        </InternalTabsContext.Provider>
    )
}