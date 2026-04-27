import { openTabs, tabHistory, openTab } from "../State";
import { enableTabs } from "../Settings";
import { CodeTab, InheritanceViewTab } from "./index";

export abstract class Tab {
    public key: string;

    public constructor(key: string) {
        this.key = key;
    }

    public open() {
        if (openTab.value && openTab.value.key === this.key) return;
        const activeTab = getOpenTab();
        activeTab?.onBlur();

        if (enableTabs.value) {
            // Get tabs and find index of currently open one
            const tabs = [...openTabs.value];
            let openTabIndex = -1;
            if (openTab.value != null) {
                // openTabIndex = tabs.indexOf(openTab.value);
                openTabIndex = tabs.findIndex(t => t.key === openTab.value?.key);
            }

            // If class is not already in open tabs array, add it
            if (!tabs.some(tab => tab.key === this.key)) {
                const insertIndex = openTabIndex >= 0 ? openTabIndex + 1 : tabs.length;
                tabs.splice(insertIndex, 0, this);
                openTabs.next(tabs);
            }
        } else {
            openTabs.next([this]);
        }

        this.pushToTabHistory();
        openTab.next(this);
    }

    public onClose() {
        openTabs.next(openTabs.value.filter(t => t.key !== this.key));

        if (openTabs.value.length === 0) {
            openTab.next(null);
        }

        this.removeFromTabHistory();
    };

    protected onBlur() { };

    protected pushToTabHistory() {
        if (tabHistory.value.length < 50) {
            // Limit history to 50
            tabHistory.next([...tabHistory.value, this.key]);
        }
    }

    protected removeFromTabHistory() {
        tabHistory.next(tabHistory.value.filter(v => v != this.key));
    }

    public openLastTabFromHistory() {
        const lastTabKeyFromHistory = tabHistory.value.length > 0 ?
            tabHistory.value[tabHistory.value.length - 1] : null;

        // Get the last tab
        let tab = openTabs.value.find(t => t.key === lastTabKeyFromHistory);

        // If no tab can be found in the tab history, we simply default to the first open one
        if (!tab) tab = openTabs.value[0];
        tab?.open();
    }

    public closeOtherTabs() {
        // Invalidate all tabs except the one being kept
        openTabs.value.forEach(t => {
            if (t.key !== this.key) t.onClose();
        });

        openTabs.value.find(t => t.key === this.key)?.open();
    }
}

export const getOpenTab = <T extends Tab>(): T | null => {
    return openTab.value as T | null;
};

const openTabOfType = <T extends Tab>(
    key: string,
    TabClass: new (key: string) => T
) => {
    const existing = openTabs.value.find(
        t => t.key === key && t instanceof TabClass
    ) as T | undefined;

    if (existing) {
        existing.open();
        return;
    }

    new TabClass(key).open();
};

// Looks for tab by key and opens it
export const openUnknownTypeTab = (key: string) => {
    if (openTab.value && openTab.value.key === key) return;
    const existing = openTabs.value.find(t => t.key === key);
    if (!existing) return;
    existing.open();
};

export const openCodeTab = (key: string) => openTabOfType(key, CodeTab);
export const openInheritanceViewTab = (key: string) => openTabOfType(key, InheritanceViewTab);

export const closeTab = (key: string) => {
    const tab = openTabs.value.find(o => o.key === key);
    tab?.onClose();
    tab?.openLastTabFromHistory();
};

export const setTabPosition = (key: string, placeIndex: number) => {
    const tabs = [...openTabs.value];
    const currentIndex = tabs.findIndex(tab => tab.key === key);
    if (currentIndex === -1) return;
    const currentTab = tabs[currentIndex];

    tabs.splice(currentIndex, 1);

    // Adjust index if moving right
    let index = placeIndex;
    if (placeIndex > currentIndex) index -= 1;

    tabs.splice(index, 0, currentTab);
    openTabs.next(tabs);
};

export const closeOtherTabs = (key: string) => {
    const tab = openTabs.value.find(tab => tab.key === key);
    tab?.closeOtherTabs();
};