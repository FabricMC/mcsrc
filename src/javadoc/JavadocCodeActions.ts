import type { editor, IDisposable, languages } from 'monaco-editor';
import type { JavadocDeclaration } from './JavadocDeclaration';
import { getJavadocQuickFixes } from './JavadocQuickFixes';
import { validateJavadoc } from './JavadocValidation';
import { JAVADOC_MARKDOWN_LANGUAGE } from './JavadocMarkdownLanguage';

/** Registers quick fixes scoped to one Javadoc editor model. */
export function registerJavadocCodeActions(monaco: typeof import('monaco-editor'), model: editor.ITextModel, declaration: JavadocDeclaration): IDisposable {
    return monaco.languages.registerCodeActionProvider(JAVADOC_MARKDOWN_LANGUAGE, {
        provideCodeActions(currentModel, range) {
            if (currentModel !== model || model.isDisposed()) return { actions: [], dispose() {} };

            const markdown = model.getValue();
            const versionId = model.getVersionId();
            const actions: languages.CodeAction[] = [];
            const titles = new Set<string>();
            for (const diagnostic of validateJavadoc(markdown, declaration)) {
                if (diagnostic.startLineNumber < range.startLineNumber || diagnostic.startLineNumber > range.endLineNumber) continue;

                for (const fix of getJavadocQuickFixes(markdown, declaration, diagnostic)) {
                    if (fix.text === markdown || titles.has(fix.title)) continue;

                    titles.add(fix.title);
                    actions.push({
                        title: fix.title,
                        kind: 'quickfix',
                        diagnostics: [{
                            ...diagnostic,
                            severity: diagnostic.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
                        }],
                        edit: { edits: [{
                            resource: model.uri,
                            versionId,
                            textEdit: { range: model.getFullModelRange(), text: fix.text },
                        }] },
                    });
                }
            }
            return { actions, dispose() {} };
        },
    }, { providedCodeActionKinds: ['quickfix'] });
}
