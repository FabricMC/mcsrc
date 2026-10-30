import type { editor } from "monaco-editor";
import { Tab } from "./Tabs";
import { selectedFile, tabHistory } from "../State";
import type { ClassFilePath } from "../../utils/Names";
import type { DecompileResult } from "../../workers/decompile/types";

export class CodeTab extends Tab {
    public declare key: ClassFilePath;
    public editorRef: editor.IStandaloneCodeEditor | null = null;
    public viewState: editor.ICodeEditorViewState | null = null;
    public model: editor.ITextModel | null = null;
    private sourceCache: DecompileResult | null = null;

    public constructor(key: ClassFilePath) {
        super(key);
    }

    public open() {
        super.open();

        // Update selectedFile
        if (selectedFile.value !== this.key) {
            selectedFile.next(this.key);
        }
    }

    public onBlur() {
        super.onBlur();

        // Save viewstate & model before a new tab is opened
        this.viewState = this.editorRef?.saveViewState() || null;
        this.model = this.editorRef?.getModel() || null;

        // Keep the current model attached until the next tab has a model to show.
        // Monaco switches models without clearing the editor in between.
    }

    public onClose() {
        super.onClose();
        this.invalidateCachedView();
        this.sourceCache = null;
    }

    public getCachedResult(): DecompileResult | null {
        return this.sourceCache;
    }

    public cacheResult(result: DecompileResult): void {
        this.sourceCache = result;
    }

    public clearSourceCache(): void {
        this.sourceCache = null;
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

    private invalidateCachedView() {
        this.viewState = null;

        if (!this.model) return;
        this.model.dispose();
        this.model = null;
    }

    public applyViewToEditor(editor: editor.IStandaloneCodeEditor) {
        if (!this.model) {
            this.invalidateCachedView();
            return;
        }

        editor.setModel(this.model);
        editor.restoreViewState(this.viewState);
    }

    public openLastTabFromHistory(): void {
        super.openLastTabFromHistory();
        if (tabHistory.value.length > 0) return;
        selectedFile.next(undefined);
    }
}
