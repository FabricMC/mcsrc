import { BehaviorSubject } from "rxjs";
import { pairwise } from "rxjs/operators";
import { Tab } from "./Tabs";
import { getInitialState } from "./Permalink";

const initialState = getInitialState();

/// All of the user controled global state should be defined here:

export const selectedMinecraftVersion = new BehaviorSubject<string | null>(
  initialState.minecraftVersion,
);

export const mobileDrawerOpen = new BehaviorSubject(false);
export const selectedFile = new BehaviorSubject<string>(initialState.file);
export const openTabs = new BehaviorSubject<Tab[]>([new Tab(initialState.file)]);
export const tabHistory = new BehaviorSubject<string[]>([initialState.file]);
export const searchQuery = new BehaviorSubject("");
export const referencesQuery = new BehaviorSubject("");

export interface SelectedLines {
  line: number;
  lineEnd?: number;
}
export const selectedLines = new BehaviorSubject<SelectedLines | null>(initialState.selectedLines);

export const diffView = new BehaviorSubject<boolean>(false);
export const diffLeftselectedMinecraftVersion = new BehaviorSubject<string | null>(null);

// Reset selected lines when file changes (skip initial emission to preserve permalink selection)
selectedFile.pipe(pairwise()).subscribe(([previousFile, currentFile]) => {
  if (previousFile !== currentFile) {
    selectedLines.next(null);
  }
});
