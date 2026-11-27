import { Observable, debounceTime, startWith } from 'rxjs';
import type { editor, IDisposable, languages } from 'monaco-editor';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { validateJavadoc, type JavadocDiagnostic } from './JavadocValidation';
import { getJavadocQuickFix } from './JavadocQuickFixes';
import { JAVADOC_MARKDOWN_LANGUAGE } from './JavadocMarkdownLanguage';

const MARKER_OWNER = 'javadoc-validation';
const VALIDATION_DELAY = 300;

/** Maintains diagnostics and quick fixes for one Javadoc editor model. */
export function applyJavadocDiagnostics(monaco: typeof import('monaco-editor'), model: editor.ITextModel, declaration: JavadocDeclaration): IDisposable {
    const toMarker = (diagnostic: JavadocDiagnostic): editor.IMarkerData => ({
        ...diagnostic,
        severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        source: 'Javadoc',
    });
    const codeActions = monaco.languages.registerCodeActionProvider(JAVADOC_MARKDOWN_LANGUAGE, {
        provideCodeActions(currentModel, range) {
            if (currentModel !== model || model.isDisposed()) return { actions: [], dispose() {} };

            const markdown = model.getValue();
            const versionId = model.getVersionId();
            const actions: languages.CodeAction[] = [];
            const titles = new Set<string>();
            for (const diagnostic of validateJavadoc(markdown, declaration)) {
                if (diagnostic.startLineNumber < range.startLineNumber || diagnostic.startLineNumber > range.endLineNumber) continue;

                const fix = getJavadocQuickFix(markdown, declaration, diagnostic);
                if (!fix || fix.text === markdown || titles.has(fix.title)) continue;

                titles.add(fix.title);
                actions.push({
                    title: fix.title,
                    kind: 'quickfix',
                    diagnostics: [toMarker(diagnostic)],
                    edit: { edits: [{
                        resource: model.uri,
                        versionId,
                        textEdit: { range: model.getFullModelRange(), text: fix.text },
                    }] },
                });
            }
            return { actions, dispose() {} };
        },
    }, { providedCodeActionKinds: ['quickfix'] });
    const update = () => {
        if (model.isDisposed()) return;

        const diagnostics = validateJavadoc(model.getValue(), declaration);
        monaco.editor.setModelMarkers(model, MARKER_OWNER, diagnostics.map(toMarker));
    };
    const changes = new Observable<void>(subscriber => {
        const listener = model.onDidChangeContent(() => subscriber.next());
        return () => listener.dispose();
    });
    const subscription = changes.pipe(debounceTime(VALIDATION_DELAY), startWith(undefined)).subscribe(update);
    return {
        dispose() {
            codeActions.dispose();
            subscription.unsubscribe();
            if (!model.isDisposed()) {
                monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
            }
        },
    };
}
