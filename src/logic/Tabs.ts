import { enableTabs } from "./Settings";
import { editor } from "monaco-editor";
import { selectedFile, openTabs, tabHistory } from "./State";

export abstract class Tab {
    public key: string;
    public scroll: number = 0;

    public constructor(key: string) {
        this.key = key;
    }

    public open() {
        const openTab = getOpenTab();
        if (openTab) openTab.onBlur();
    }

    public onClose() {
        openTabs.next(openTabs.value.filter(t => t.key !== this.key));
    };

    abstract onBlur(): void;

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

        // If no tab can be find in the tab history, we simply to the first open Tab
        if (!tab) tab = openTabs.value[0];
        if (!tab) return;

        tab.open();
    }

    public closeOtherTabs() {
        // Invalidate all tabs except the one being kept
        openTabs.value.forEach(t => {
            if (t.key !== this.key) t.onClose();
        });
    }
}

export class CodeTab extends Tab {
    public editorRef: editor.IStandaloneCodeEditor | null = null;
    public viewState: editor.ICodeEditorViewState | null = null;
    public model: editor.ITextModel | null = null;

    constructor(key: string) {
        super(key);
    }

    public open() {
        super.open();

        if (!enableTabs.value) {
            const currentTab = openTabs.value[0];
            if (currentTab && currentTab.key !== this.key) {
                selectedFile.next(this.key);
                if (currentTab instanceof CodeTab) currentTab.invalidateCachedView();
                openTabs.next([this]);
            } else if (!currentTab) {
                selectedFile.next(this.key);
                openTabs.next([this]);
            }

            return;
        }

        const tabs = [...openTabs.value];
        const activeIndex = tabs.findIndex(tab => tab.key === selectedFile.value);

        // If class is not already open, open it
        if (!tabs.some(tab => tab.key === this.key)) {
            const insertIndex = activeIndex >= 0 ? activeIndex + 1 : tabs.length;
            tabs.splice(insertIndex, 0, this);
            openTabs.next(tabs);
        }

        // Switch to the newly opened tab, if not already open to the right class
        if (selectedFile.value !== this.key) {
            selectedFile.next(this.key);
            this.pushToTabHistory();
        }
    }

    public onBlur() {
        // Save viewstate before a new tab is opened
        this.cacheView(
            this.editorRef?.saveViewState() || null,
            this.editorRef?.getModel() || null
        );
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

    public cacheView(
        viewState: editor.ICodeEditorViewState | null,
        model: editor.ITextModel | null
    ) {
        this.viewState = viewState;
        this.model = model;
    }

    private invalidateCachedView() {
        this.viewState = null;

        if (!this.model) return;
        this.model.dispose();
        this.model = null;
    }

    public applyViewToEditor(editor: editor.IStandaloneCodeEditor) {
        if (!this.model) return;
        editor.setModel(this.model);
        if (this.viewState) editor.restoreViewState(this.viewState);
    }

    public closeOtherTabs(): void {
        super.closeOtherTabs();

        if (selectedFile.value !== this.key) {
            selectedFile.next(this.key);
        }
    }
}

export const getOpenTab = <T extends Tab>(): T | null => {
    return openTabs.value.find(o => o.key === selectedFile.value) as T || null;
};

export const openCodeTab = (key: string) => {
    const existing = openTabs.value.find(
        t => t.key === key && t instanceof CodeTab
    );

    if (existing) {
        existing.open();
        return;
    }

    new CodeTab(key).open();
};

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
