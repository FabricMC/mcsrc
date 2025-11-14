import { BehaviorSubject } from "rxjs";
import { setSelectedFile, state } from "./State";
import { enableTabs } from "./Settings";

export const activeTabKey = new BehaviorSubject<string>(state.value.file);
export const openTabs = new BehaviorSubject<string[]>([state.value.file]);
const tabHistory = new BehaviorSubject<string[]>([]);

export const openTab = (key: string) => {
  if (!enableTabs.value) {
    setSelectedFile(key);
    return;
  }

  const tabs = [...openTabs.value];
  const activeIndex = tabs.indexOf(activeTabKey.value);

  if (!tabs.includes(key)) {
    const insertIndex = activeIndex >= 0 ? activeIndex + 1 : tabs.length;
    tabs.splice(insertIndex, 0, key);
    openTabs.next(tabs);
  }

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

  tabHistory.next(tabHistory.value.filter(v => v != key));
  const modifiedOpenTabs = openTabs.value.filter(v => v != key);

  if (key === activeTabKey.value) {
    const history = [...tabHistory.value];
    let newKey = history.pop();
    tabHistory.next(history);

    if (!newKey) {
      // If undefined, open tab left of it
      let i = openTabs.value.indexOf(key) - 1;
      i = Math.max(i, 0);
      i = Math.min(i, modifiedOpenTabs.length - 1);
      newKey = modifiedOpenTabs[i];
    }

    openTab(newKey);
  }

  openTabs.next(modifiedOpenTabs);
};

export const setTabPosition = (key: string, placeIndex: number) => {
  const tabs = [...openTabs.value];
  const curr = tabs.indexOf(key);
  if (curr === -1) return;

  tabs.splice(curr, 1);

  // Adjust index if moving right
  let index = placeIndex;
  if (placeIndex > curr) index -= 1;

  tabs.splice(index, 0, key);
  openTabs.next(tabs);
};
