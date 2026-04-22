import { BehaviorSubject } from "rxjs";
import { pairwise } from "rxjs/operators";
import { Tab, CodeTab } from "./tabs";
import { getInitialState } from "./Permalink";

const initialState = getInitialState();

export const selectedMinecraftVersion = new BehaviorSubject<string | null>(initialState.minecraftVersion);

export const mobileDrawerOpen = new BehaviorSubject(false);
export const selectedFile = new BehaviorSubject<string | undefined>(initialState.file);
const initialTab = initialState.file ? new CodeTab(initialState.file) : null;
export const openTab = new BehaviorSubject<Tab | null>(initialTab);
export const openTabs = new BehaviorSubject<Tab[]>(initialTab ? [initialTab] : []);
export const tabHistory = new BehaviorSubject<string[]>(initialState.file ? [initialState.file] : []);
export const searchQuery = new BehaviorSubject("");
export const referencesQuery = new BehaviorSubject("");
export const grepHighlightQuery = new BehaviorSubject<string>("");

export interface SelectedLines {
    line: number;
    lineEnd?: number;
}
export const selectedLines = new BehaviorSubject<SelectedLines | null>(initialState.selectedLines);

export const diffView = new BehaviorSubject<boolean>(!!initialState.diff);
export const diffLeftSelectedMinecraftVersion = new BehaviorSubject<string | null>(initialState.diff?.leftMinecraftVersion ?? null);

selectedFile.pipe(pairwise()).subscribe(([previousFile, currentFile]) => {
    if (previousFile !== currentFile) {
        selectedLines.next(null);
    }
});