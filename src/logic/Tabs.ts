import { editor } from "monaco-editor";
import { selectedFile, openTabs, tabHistory, openTab } from "./State";
import type { Key } from "react";
import type { TreeDataNode } from "antd";
import { enableTabs } from "./Settings";

export abstract class Tab {
    public key: string;
    public scroll: number = 0;

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

        if (!lastTabKeyFromHistory) {
            // No tabs left in history
            selectedFile.next(""); // clear selectedFile
            return;
        }

        // Get the last tab
        let tab = openTabs.value.find(t => t.key === lastTabKeyFromHistory);

        // If no tab can be found in the tab history, we simply default to the first open one
        if (!tab) tab = openTabs.value[0];
        if (!tab) return;

        tab.open();
    }

    public closeOtherTabs() {
        // Invalidate all tabs except the one being kept
        openTabs.value.forEach(t => {
            if (t.key !== this.key) t.onClose();
        });

        openTabs.value.find(t => t.key === this.key)?.open();
    }
}

export class CodeTab extends Tab {
    public editorRef: editor.IStandaloneCodeEditor | null = null;
    public viewState: editor.ICodeEditorViewState | null = null;
    public model: editor.ITextModel | null = null;

    public open() {
        super.open();

        if (!enableTabs.value) {
            const currentTab = openTabs.value[0];
            if (currentTab && currentTab.key !== this.key) {
                selectedFile.next(this.key);
                if (currentTab instanceof CodeTab) currentTab.invalidateCachedView();
            } else if (!currentTab) {
                selectedFile.next(this.key);
            }

            return;
        }

        // Update selectedFile
        if (selectedFile.value !== this.key) {
            selectedFile.next(this.key);
        }
    }

    public onBlur() {
        super.onBlur();

        // Save viewstate & model before a new tab is opened
        this.viewState = this.editorRef?.saveViewState() || null;
        this.model = this.editorRef?.getModel() || null;

        // Setting the editor's model here separates the two.
        // Otherwise - if monaco is unmounted - all models are disposed.
        // This allows for caching while a different tab type other than the code view is open
        this.editorRef?.setModel(null);
    }

    public onClose() {
        super.onClose();
        this.invalidateCachedView();
        this.removeFromTabHistory();
    }

    public setModel(model: editor.ITextModel) {
        if (this.isCachedModelEqualTo(model)) {
            model.dispose();
            return;
        }

        this.invalidateCachedView();
        this.model = model;
    }

    private isCachedModelEqualTo(model: editor.ITextModel): boolean {
        if (this.model === null || this.model.isDisposed()) return false;
        if (model === null || model.isDisposed()) return false;
        if (this.model.getLanguageId() !== model.getLanguageId()) return false;
        if (this.model.getLineCount() !== model.getLineCount()) return false;

        for (let i = 1; i <= this.model.getLineCount(); i++) {
            if (this.model.getLineContent(i) !== model.getLineContent(i)) {
                return false;
            }
        }

        return true;
    }

    private invalidateCachedView() {
        this.viewState = null;

        if (!this.model) return;
        this.model.dispose();
        this.model = null;
    }

    public applyViewToEditor(editor: editor.IStandaloneCodeEditor) {
        if (!this.model) {
            this.invalidateCachedView();
            return;
        }

        editor.setModel(this.model);
        editor.restoreViewState(this.viewState);
    }

    public closeOtherTabs(): void {
        super.closeOtherTabs();
    }
}

export class InheritanceViewTab extends Tab {
    public innerTabs: {
        active: string,
        tree: {
            initialized: boolean,
            nodes: TreeDataNode[],
            expanded: Key[];
        },
        graph: {
            initialized: boolean,
            nodes: any[],
            edges: any[],
            viewport: undefined | { x: number, y: number, zoom: number; },
        };
    } = {
            active: "tree",
            tree: {
                initialized: false,
                nodes: [],
                expanded: []
            },
            graph: {
                initialized: false,
                nodes: [] as any[],
                edges: [] as any[],
                viewport: undefined
            }
        };

    constructor(key: string) {
        super(`hierarchy::${key}`);
    }

    public open(): void {
        super.open();

        selectedFile.next("");

        (async () => {
            // We need to unfortunately do an async import here because else we'll get
            // a circular import (minecraftJar)
            const { selectedInheritanceClassName } = await import("./Inheritance");
            selectedInheritanceClassName.next(this.key.replace("hierarchy::", ""));
        })();
    }

    protected onBlur(): void {
        super.onBlur();

        (async () => {
            const { selectedInheritanceClassName } = await import("./Inheritance");
            selectedInheritanceClassName.next(null);
        })();
    }
}

export const getOpenTab = <T extends Tab>(): T | null => {
    // return openTabs.value.find(o => o.key === selectedFile.value) as T || null;
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