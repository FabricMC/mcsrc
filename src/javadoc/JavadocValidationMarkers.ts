import type { editor, IDisposable } from 'monaco-editor';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { validateJavadoc } from './JavadocValidation';

const MARKER_OWNER = 'javadoc-validation';
const VALIDATION_DELAY = 300;

/** Maintains model-local diagnostics while editing and removes them when the editor closes. */
export function applyJavadocValidation(monaco: typeof import('monaco-editor'), model: editor.ITextModel, declaration: JavadocDeclaration): IDisposable {
    const update = () => {
        if (model.isDisposed()) return;

        const markers = validateJavadoc(model.getValue(), declaration).map(diagnostic => ({
            ...diagnostic,
            severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            source: 'Javadoc',
        }));
        monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listener = model.onDidChangeContent(() => {
        clearTimeout(timer);
        timer = setTimeout(update, VALIDATION_DELAY);
    });
    update();
    return {
        dispose() {
            clearTimeout(timer);
            listener.dispose();
            if (!model.isDisposed()) {
                monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
            }
        },
    };
}
