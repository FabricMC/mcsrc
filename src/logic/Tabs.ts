import { BehaviorSubject, withLatestFrom } from "rxjs";
import { setSelectedFile, state } from "./State";
import { bytecode, displayLambdas, enableTabs } from "./Settings";
import { editor } from "monaco-editor";
import { type DecompileResult } from "./Decompiler";
import { selectedMinecraftVersion } from "./MinecraftApi";

class Tab {
    public key: string;
    public scroll: number = 0;

    public language: DecompileResult["language"];
    private version: string | null = selectedMinecraftVersion.value;
    private lambdas: boolean = displayLambdas.value;
    public viewState: editor.ICodeEditorViewState | null = null;
    public model: editor.ITextModel | null = null;

    constructor(key: string) {
        this.key = key;
        this.language = bytecode.value ? "bytecode" : "java";
    }

    /**
     * Checks if cache is invalid.
     * This is the case if the language or the version changed.
     */
    isViewValid(): boolean {
        const lang = bytecode.value ? "bytecode" : "java";
        if (
            this.language === lang &&
            this.version === selectedMinecraftVersion.value &&
            this.lambdas === displayLambdas.value
        ) return true;
        return false;
    }

    invalidateView() {
        if (this.isViewValid()) return;
        this.language = bytecode.value ? "bytecode" : "java";
        this.version = selectedMinecraftVersion.value;
        this.lambdas = displayLambdas.value;
        this.resetCachedView();
    }

    cacheView(
        language: DecompileResult["language"],
        viewState: editor.ICodeEditorViewState | null,
        model: editor.ITextModel | null
    ) {
        this.language = language;
        this.viewState = viewState;
        this.model = model;
    }

    resetCachedView() {
        this.viewState = null;

        if (!this.model) return;
        this.model.dispose();
        this.model = null;
    }

    applyViewToEditor(editor: editor.IStandaloneCodeEditor) {
        if (!this.model) return;
        editor.setModel(this.model);
        if (this.viewState) editor.restoreViewState(this.viewState);
    }
}

export const activeTabKey = new BehaviorSubject<string>(state.value.file);
export const openTabs = new BehaviorSubject<Tab[]>([new Tab(state.value.file)]);
export const tabHistory = new BehaviorSubject<string[]>([state.value.file]);

export const getOpenTab = (): (Tab | null) => {
    return openTabs.value.find(o => o.key === activeTabKey.value) || null;
};

export const openTab = (key: string) => {
    if (!enableTabs.value) {
        setSelectedFile(key);
        return;
    }

    const tabs = [...openTabs.value];
    const activeIndex = tabs.findIndex(tab => tab.key === activeTabKey.value);

    // If class is not already open, open it
    if (!tabs.some(tab => tab.key === key)) {
        const insertIndex = activeIndex >= 0 ? activeIndex + 1 : tabs.length;
        tabs.splice(insertIndex, 0, new Tab(key));
        openTabs.next(tabs);
    }

    // Switch to the newly opened tab, if not already open to the right class
    if (activeTabKey.value !== key) {
        activeTabKey.next(key);
        setSelectedFile(key);

        if (tabHistory.value.length < 50) {
            // Limit history to 50
            tabHistory.next([...tabHistory.value, key]);
        }
    }
};

export const closeTab = (key: string) => {
    if (openTabs.value.length <= 1) return;

    const tab = openTabs.value.find(o => o.key === key);

    tab?.resetCachedView();
    tabHistory.next(tabHistory.value.filter(v => v != key));
    const modifiedOpenTabs = openTabs.value.filter(v => v.key != key);

    if (key === activeTabKey.value) {
        const history = [...tabHistory.value];
        let newKey = history.pop();
        tabHistory.next(history);

        if (!newKey) {
            // If undefined, open tab left of it
            let i = openTabs.value.findIndex(tab => tab.key === key) - 1;
            i = Math.max(i, 0);
            i = Math.min(i, modifiedOpenTabs.length - 1);
            newKey = modifiedOpenTabs[i].key;
        }

        openTab(newKey);
    }

    openTabs.next(modifiedOpenTabs);
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
    if (!tab) return;

    openTabs.next([tab]);
    tabHistory.next([key]);

    if (activeTabKey.value !== key) {
        activeTabKey.next(key);
        setSelectedFile(key);
    }
};
