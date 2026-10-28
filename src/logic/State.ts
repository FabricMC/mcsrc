import { BehaviorSubject, combineLatest } from "rxjs";
import { pairwise } from "rxjs/operators";
import { Tab, CodeTab, InheritanceViewTab } from "./tabs";
import { getInitialState } from "./Permalink";
import { loadSavedTabState, persistTabState, type SavedTab } from "./TabPersistence";
import { enableTabs } from "./Settings";
import { DEFAULT_VERSION, getVersionFromPermalink, type Version } from "./vineflower/versions";
import { toClassFilePath, type ClassFilePath } from "../utils/Names";
import type { ReferenceKey } from "../workers/jar-index/types";

const initialState = getInitialState();

const createTabFromSaved = (saved: SavedTab): Tab =>
    saved.type === "CodeTab"
        ? new CodeTab(toClassFilePath(saved.key))
        : new InheritanceViewTab(saved.key);

const serializeTabs = (tabs: Tab[]): SavedTab[] => tabs.flatMap(tab => {
    if (tab instanceof CodeTab)
        return { type: "CodeTab" as const, key: tab.key };

    if (tab instanceof InheritanceViewTab)
        return { type: "InheritanceViewTab" as const, key: tab.key };
    return [];
});

const buildInitialTabState = () => {
    const savedTabState = loadSavedTabState();
    const saved = savedTabState && enableTabs.value ? savedTabState.state : null;
    const tabs: Tab[] = [];

    for (const savedTab of saved?.openTabs ?? []) {
        const tab = createTabFromSaved(savedTab);
        if (!tabs.some(t => t.key === tab.key)) tabs.push(tab);
    }

    // The file from the URL always gets a tab, even if it wasn't part of the saved tabs
    if (initialState.file && !tabs.some(t => t.key === initialState.file)) {
        tabs.unshift(new CodeTab(initialState.file));
    }

    const findTab = (key: string | null | undefined) => key ? tabs.find(t => t.key === key) ?? null : null;

    // A history entry's active tab wins over the URL, for direct loads the URL wins
    const preferredKeys = savedTabState?.fromHistory
        ? [savedTabState.state.activeTabKey, initialState.file, saved?.activeTabKey]
        : [initialState.file, saved?.activeTabKey];
    const active = preferredKeys.reduce<Tab | null>((tab, key) => tab ?? findTab(key), null) ?? tabs[0] ?? null;

    const permalinkHasVersion = !!(initialState.minecraftVersion && initialState.minecraftVersion.length > 0);
    const savedVersion = permalinkHasVersion ? null : saved?.minecraftVersion ?? null;
    const minecraftVersion = initialState.minecraftVersion || savedVersion || null;

    return { tabs: enableTabs.value || !active ? tabs : [active], active, minecraftVersion };
};

const { tabs: initialTabs, active: initialActive, minecraftVersion: initialMinecraftVersion } = buildInitialTabState();

/// All of the user controled global state should be defined here:

export const selectedMinecraftVersion = new BehaviorSubject<string | null>(initialMinecraftVersion);

export const mobileDrawerOpen = new BehaviorSubject(false);
export const selectedFile = new BehaviorSubject<ClassFilePath | undefined>(
    initialActive instanceof CodeTab ? initialActive.key : undefined
);
export const openTab = new BehaviorSubject<Tab | null>(null);
export const openTabs = new BehaviorSubject<Tab[]>(initialTabs);
export const tabHistory = new BehaviorSubject<string[]>(
    initialTabs.filter(t => t !== initialActive).map(t => t.key)
);
export type SearchType = "classes" | "methods" | "fields";
export const searchType = new BehaviorSubject<SearchType>("classes");
export const searchQuery = new BehaviorSubject("");
export const vineflowerVersion = new BehaviorSubject<Version>(getVersionFromPermalink(initialState.version));
export const referencesQuery = new BehaviorSubject<ReferenceKey | "">("");

export interface SelectedLines {
    line: number;
    lineEnd?: number;
}
export const selectedLines = new BehaviorSubject<SelectedLines | null>(initialState.selectedLines);

export const diffView = new BehaviorSubject<boolean>(!!initialState.diff);
export const diffLeftSelectedMinecraftVersion = new BehaviorSubject<string | null>(initialState.diff?.leftMinecraftVersion ?? null);
export const diffSelectionSide = new BehaviorSubject<'left' | 'right' | null>(initialState.diff?.selectionSide ?? null);

export function swapDiffSelectionSideIfPresent() {
    if (diffSelectionSide.value) {
        diffSelectionSide.next(diffSelectionSide.value === 'left' ? 'right' : 'left');
    }
}

// Reset selected lines when file changes (skip initial emission to preserve permalink selection)
// Also reset the permalink version back to the latest
selectedFile.pipe(pairwise()).subscribe(([previousFile, currentFile]) => {
    if (previousFile !== currentFile) {
        selectedLines.next(null);
        vineflowerVersion.next(DEFAULT_VERSION);
    }
});

initialActive?.open();

combineLatest([openTabs, openTab, selectedMinecraftVersion]).subscribe(([tabs, activeTab, minecraftVersion]) =>
    persistTabState({ openTabs: serializeTabs(tabs), activeTabKey: activeTab?.key ?? null, minecraftVersion }));
