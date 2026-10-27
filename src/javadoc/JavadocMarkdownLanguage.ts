import type * as monaco from 'monaco-editor';
import { conf, language } from 'monaco-editor/languages/definitions/markdown/markdown.js';

export const JAVADOC_MARKDOWN_LANGUAGE = 'javadoc-markdown';

/** Extends Monaco's Markdown highlighting with Javadoc block tags and parameter names. */
export function registerJavadocMarkdownLanguage(editor: typeof monaco) {
    editor.languages.register({ id: JAVADOC_MARKDOWN_LANGUAGE });
    editor.languages.setLanguageConfiguration(JAVADOC_MARKDOWN_LANGUAGE, conf);
    editor.languages.setMonarchTokensProvider(JAVADOC_MARKDOWN_LANGUAGE, {
        ...language,
        tokenizer: {
            ...language.tokenizer,
            root: [
                [/^( {0,3})([@]param)([\t ]+)(<[^>\s]+>|[^\s]+)/,
                    ['white', 'keyword', 'white', 'type.identifier']],
                [/^ {0,3}@\w+\b/, 'keyword'],
                ...language.tokenizer.root,
            ],
        },
    });
}
