import { BehaviorSubject } from "rxjs";
import { pairwise } from "rxjs/operators";
import { Tab, CodeTab } from "./tabs";
import { getInitialState } from "./Permalink";
import { DEFAULT_VERSION, getVersionFromPermalink, type Version } from "./vineflower/versions";
import type { ClassFilePath } from "../utils/Names";
import type { ReferenceKey } from "../workers/jar-index/types";

const initialState = getInitialState();

/// All of the user controled global state should be defined here:

export const selectedMinecraftVersion = new BehaviorSubject<string | null>(initialState.minecraftVersion);

export const mobileDrawerOpen = new BehaviorSubject(false);
export const selectedFile = new BehaviorSubject<ClassFilePath | undefined>(initialState.file);
const initialTab = initialState.file ? new CodeTab(initialState.file) : null;
export const openTab = new BehaviorSubject<Tab | null>(initialTab);
export const openTabs = new BehaviorSubject<Tab[]>(initialTab ? [initialTab] : []);
export const tabHistory = new BehaviorSubject<string[]>(initialState.file ? [initialState.file] : []);
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
