import { tabPersistance } from "./Settings";

export interface SavedTab {
    type: "CodeTab" | "InheritanceViewTab";
    key: string;
}

export interface SavedTabState {
    openTabs: SavedTab[];
    activeTabKey: string | null;
    minecraftVersion?: string | null;
}

const STORAGE_KEY = "tab_state";

export const parseSavedTabState = (value: unknown): SavedTabState | null => {
    const state = value as { openTabs?: unknown; activeTabKey?: unknown; minecraftVersion?: unknown; } | null;
    if (!state || !Array.isArray(state.openTabs)) return null;

    const openTabs = state.openTabs.filter((tab): tab is SavedTab => {
        const { type, key } = (tab ?? {}) as Partial<SavedTab>;
        return typeof key === "string" && (
            (type === "CodeTab" && key.endsWith(".class")) ||
            (type === "InheritanceViewTab" && key.startsWith("hierarchy::"))
        );
    });

    return {
        openTabs,
        activeTabKey: typeof state.activeTabKey === "string" ? state.activeTabKey : null,
        minecraftVersion: typeof state.minecraftVersion === "string" ? state.minecraftVersion : null
    };
};

export const loadSavedTabState = (): { state: SavedTabState; fromHistory: boolean; } | null => {
    if (!tabPersistance.value) return null;

    const fromHistory = Array.isArray(window.history.state?.openTabs);
    try {
        const value = fromHistory ? window.history.state : localStorage.getItem(STORAGE_KEY);
        const state = parseSavedTabState(typeof value === "string" ? JSON.parse(value) : value);
        if (state) return { state, fromHistory };
    } catch {
        // Haha get ignored
    }
    return null;
};

export const persistTabState = (state: SavedTabState): void => {
    if (!tabPersistance.value) {
        try {
            localStorage.removeItem(STORAGE_KEY);
            const historyState = { ...(window.history.state ?? {}) };
            delete (historyState as any).openTabs;
            delete (historyState as any).activeTabKey;
            delete (historyState as any).minecraftVersion;
            window.history.replaceState(historyState, '');
        } catch {
            // Haha get ignored
        }
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
        // Haha get ignored
    }

    try {
        window.history.replaceState({ ...(window.history.state ?? {}), ...state }, '');
    } catch {
        // Haha get ignored
    }
};
