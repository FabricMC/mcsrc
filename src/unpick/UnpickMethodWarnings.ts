import type { editor, languages } from "monaco-editor";
import { useEffect } from "react";
import { combineLatest, debounceTime, Observable, startWith } from "rxjs";
import type { HierarchyNavigation } from "../logic/HierarchyNavigation";
import { automaticHierarchyNavigation } from "../logic/Inheritance";
import { minecraftJar } from "../logic/MinecraftApi";
import { selectedMinecraftVersion } from "../logic/State";
import { classNameFromDottedClassName, dottedClassNameFromClassName } from "../utils/Names";
import { UNPICK_LANGUAGE } from "./UnpickLanguage";
import { parseTargetMethod } from "./UnpickTargetMethod";

const MARKER_OWNER = "unpick-method-warnings";

export function useUnpickMethodWarnings(monaco: typeof import("monaco-editor") | null, model: editor.ITextModel | null) {
    useEffect(() => {
        if (!monaco || !model || model.isDisposed()) return;

        let index: HierarchyNavigation | undefined;
        const warningAt = (lineNumber: number) => {
            if (!index) return;
            const target = parseTargetMethod(model.getLineContent(lineNumber));
            if (!target) return;

            const owner = classNameFromDottedClassName(target.owner);
            const parents = index.methodParents(owner, target.name, target.descriptor);
            const [parent] = parents;
            if (!parent) return;

            const parentOwner = dottedClassNameFromClassName(parent.className);
            const marker: editor.IMarkerData = {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber,
                endColumn: target.endColumn,
                severity: monaco.MarkerSeverity.Warning,
                message: `This method overrides ${parentOwner}.${parent.name}. Consider targeting a base declaration.`,
                source: "Unpick",
            };
            return { marker, parents };
        };

        const codeActions = monaco.languages.registerCodeActionProvider(UNPICK_LANGUAGE, {
            provideCodeActions(currentModel, range) {
                const actions: languages.CodeAction[] = [];
                if (currentModel !== model || model.isDisposed() || !index) return { actions, dispose() {} };

                const versionId = model.getVersionId();
                for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
                    const warning = warningAt(line);
                    if (!warning) continue;
                    for (const { className, name, descriptor } of warning.parents) {
                        if (!name || !descriptor || index.methodParents(className, name, descriptor).length > 0) continue;
                        const owner = dottedClassNameFromClassName(className);
                        actions.push({
                            title: `Target base method ${owner}.${name}`,
                            kind: "quickfix",
                            diagnostics: [warning.marker],
                            edit: { edits: [{
                                resource: model.uri,
                                versionId,
                                textEdit: { range: warning.marker, text: `target_method ${owner} ${name} ${descriptor}` },
                            }] },
                        });
                    }
                }
                return { actions, dispose() {} };
            },
        }, { providedCodeActionKinds: ["quickfix"] });

        const changes = new Observable<void>(subscriber => {
            const listener = model.onDidChangeContent(() => subscriber.next());
            return () => listener.dispose();
        });
        const subscription = combineLatest([
            automaticHierarchyNavigation,
            minecraftJar,
            selectedMinecraftVersion,
            changes.pipe(debounceTime(300), startWith(undefined)),
        ]).subscribe(([navigation, jar, version]) => {
            if (model.isDisposed()) return;
            index = jar.version === version && navigation?.jarName === jar.jar.name ? navigation.index : undefined;
            const markers: editor.IMarkerData[] = [];
            if (index) {
                for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
                    const warning = warningAt(lineNumber);
                    if (warning) markers.push(warning.marker);
                }
            }
            monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
        });

        return () => {
            codeActions.dispose();
            subscription.unsubscribe();
            if (!model.isDisposed()) monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
        };
    }, [monaco, model]);
}
