import { BehaviorSubject } from "rxjs";
import { Tab } from "./Tabs";
import { initalState } from "./Permalink";

/// All of the user controled global state should be defined here:

export const selectedMinecraftVersion = new BehaviorSubject<string | null>(null);

export const selectedFile = new BehaviorSubject<string>(initalState.file);
export const openTabs = new BehaviorSubject<Tab[]>([new Tab(initalState.file)]);
export const tabHistory = new BehaviorSubject<string[]>([initalState.file]);
export const searchQuery = new BehaviorSubject("");
export const usageQuery = new BehaviorSubject("");

export interface SelectedLines {
  line: number;
  lineEnd?: number;
}
export const selectedLines = new BehaviorSubject<SelectedLines | null>(initalState.selectedLines);

export const diffView = new BehaviorSubject<boolean>(false);
export const diffLeftselectedMinecraftVersion = new BehaviorSubject<string | null>(null);
