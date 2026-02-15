import { editor } from "monaco-editor";

import { enableTabs } from "./Settings";
import { selectedFile, openTabs, tabHistory } from "./State";

export class Tab {
  public key: string;
  public scroll: number = 0;

  public viewState: editor.ICodeEditorViewState | null = null;
  public model: editor.ITextModel | null = null;

  public constructor(key: string) {
    this.key = key;
  }

  isCachedModelEqualTo(model: editor.ITextModel): boolean {
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

  cacheView(viewState: editor.ICodeEditorViewState | null, model: editor.ITextModel | null) {
    this.viewState = viewState;
    this.model = model;
  }

  invalidateCachedView() {
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

export const getOpenTab = (): Tab | null => {
  return openTabs.value.find((o) => o.key === selectedFile.value) || null;
};

export const openTab = (key: string) => {
  if (!enableTabs.value) {
    selectedFile.next(key);

    const currentTab = openTabs.value[0];
    if (currentTab && currentTab.key !== key) {
      currentTab.invalidateCachedView();
      openTabs.next([new Tab(key)]);
    }

    return;
  }

  const tabs = [...openTabs.value];
  const activeIndex = tabs.findIndex((tab) => tab.key === selectedFile.value);

  // If class is not already open, open it
  if (!tabs.some((tab) => tab.key === key)) {
    const insertIndex = activeIndex >= 0 ? activeIndex + 1 : tabs.length;
    tabs.splice(insertIndex, 0, new Tab(key));
    openTabs.next(tabs);
  }

  // Switch to the newly opened tab, if not already open to the right class
  if (selectedFile.value !== key) {
    selectedFile.next(key);

    if (tabHistory.value.length < 50) {
      // Limit history to 50
      tabHistory.next([...tabHistory.value, key]);
    }
  }
};

export const closeTab = (key: string) => {
  if (openTabs.value.length <= 1) return;

  const tab = openTabs.value.find((o) => o.key === key);

  tab?.invalidateCachedView();
  tabHistory.next(tabHistory.value.filter((v) => v != key));
  const modifiedOpenTabs = openTabs.value.filter((v) => v.key != key);

  if (key === selectedFile.value) {
    const history = [...tabHistory.value];
    let newKey = history.pop();
    tabHistory.next(history);

    if (!newKey) {
      // If undefined, open tab left of it
      let i = openTabs.value.findIndex((tab) => tab.key === key) - 1;
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
  const currentIndex = tabs.findIndex((tab) => tab.key === key);
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
  const tab = openTabs.value.find((tab) => tab.key === key);
  if (!tab) return;

  // Invalidate all tabs except the one being kept
  openTabs.value.forEach((t) => {
    if (t.key !== key) t.invalidateCachedView();
  });

  openTabs.next([tab]);
  tabHistory.next([key]);

  if (selectedFile.value !== key) {
    selectedFile.next(key);
  }
};
