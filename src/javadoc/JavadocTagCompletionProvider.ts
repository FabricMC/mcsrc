import { languages, type editor, type Position } from 'monaco-editor';
import type { Token } from '../logic/Tokens';
import type { DecompileResult } from '../workers/decompile/types';
import { getDeclaredExceptions, getJavadocDeclaration, type JavadocDeclaration } from './JavadocDeclaration';
import { getMarkdownContext } from './JavadocReference';
import { readJavadocBlockTags } from './JavadocBlockTags';
import { escapeSnippet, getCompletionRange, type CompletionRange } from './JavadocCompletionUtils';

interface TagContext {
    kind: 'tag' | 'parameter' | 'exception';
    range: CompletionRange;
    hasDescription: boolean;
}

interface DocumentedTags {
    tags: Set<string>;
    parameters: Set<string>;
    exceptions: Set<string>;
}

interface TagSuggestion {
    label: string;
    insertText: string;
    detail: string;
    filterText?: string;
}

interface TagDefinition {
    name: string;
    content: string;
    detail: string;
    repeatable?: boolean;
}

const commonTags: TagDefinition[] = [
    { name: 'since', content: ' ${1:version}', detail: 'Specify when this API was introduced' },
    { name: 'deprecated', content: ' ${1:reason and replacement}', detail: 'Explain deprecation and suggest a replacement' },
    { name: 'see', content: ' ${1:Type#member}', detail: 'Reference a related API', repeatable: true },
    { name: 'apiNote', content: '\n${1:description}', detail: 'Add API usage guidance' },
    { name: 'hidden', content: '', detail: 'Exclude this declaration from generated documentation' },
];

const methodTags: TagDefinition[] = [
    { name: 'throws', content: ' ${1:Exception} ${2:description}', detail: 'Document when an exception is thrown', repeatable: true },
    { name: 'implSpec', content: '\n${1:description}', detail: 'Describe implementation requirements' },
    { name: 'implNote', content: '\n${1:description}', detail: 'Describe this implementation' },
];

const classTags: TagDefinition[] = [
    { name: 'author', content: ' ${1:name}', detail: 'Credit an author', repeatable: true },
    { name: 'version', content: ' ${1:version}', detail: 'Specify the API version' },
];

function getTagContext(model: editor.ITextModel, position: Position): TagContext | null {
    const line = model.getLineContent(position.lineNumber);
    const cursor = position.column - 1;
    const beforeCursor = line.slice(0, cursor);
    const parameterMatch = /^ {0,3}@param[ \t]+([<\p{ID_Continue}$>]*)$/u.exec(beforeCursor);
    const exceptionMatch = /^ {0,3}@(throws|exception)[ \t]+([\p{ID_Continue}$.]*)$/u.exec(beforeCursor);
    const tagMatch = /^ {0,3}@(\w*)$/.exec(beforeCursor);
    let kind: TagContext['kind'];
    let prefix: string;
    if (parameterMatch) {
        kind = 'parameter';
        prefix = parameterMatch[1];
    } else if (exceptionMatch) {
        kind = 'exception';
        prefix = exceptionMatch[2];
    } else if (tagMatch) {
        kind = 'tag';
        prefix = `@${tagMatch[1]}`;
    } else {
        return null;
    }
    if (getMarkdownContext(model, position).inCode) {
        return null;
    }
    const startColumn = position.column - prefix.length;
    const suffixPattern = kind === 'exception' ? /^[\p{ID_Continue}$.]*/u : /^[\p{ID_Continue}$<>]*/u;
    const suffix = suffixPattern.exec(line.slice(cursor))![0];
    const endColumn = position.column + suffix.length;
    return {
        kind,
        range: getCompletionRange(position, startColumn, endColumn),
        hasDescription: line.slice(endColumn - 1).trim().length > 0,
    };
}

function collectDocumentedTags(model: editor.ITextModel, currentLine: number): DocumentedTags {
    const documented: DocumentedTags = { tags: new Set(), parameters: new Set(), exceptions: new Set() };
    for (const tag of readJavadocBlockTags(model.getValue())) {
        if (tag.line === currentLine) continue;

        documented.tags.add(tag.name);
        if (tag.name === 'param' && tag.parameter) {
            documented.parameters.add(tag.parameter);
        }
        if (tag.name === 'throws' || tag.name === 'exception') {
            const exception = /^\S+/.exec(tag.description)?.[0];
            if (exception) documented.exceptions.add(exception);
        }
    }
    return documented;
}

function isExceptionDocumented(exception: string, documented: Set<string>): boolean {
    for (const name of documented) {
        if (name === exception || name === exception.split('.').at(-1) || exception === name.split('.').at(-1)) {
            return true;
        }
    }
    return false;
}

function createExceptionSuggestions(exceptions: string[], context: TagContext): TagSuggestion[] {
    if (context.kind === 'tag' && context.hasDescription) return [];

    return exceptions.map(exception => {
        const label = context.kind === 'exception' ? exception : `@throws ${exception}`;
        const description = context.hasDescription ? '' : ' ${1:description}';
        return {
            label,
            insertText: `${escapeSnippet(label)}${description}$0`,
            detail: 'Document a declared exception',
        };
    });
}

function createParameterSuggestions(parameters: string[], context: TagContext): TagSuggestion[] {
    if (context.kind === 'tag' && context.hasDescription) {
        if (parameters.length === 0) {
            return [];
        }
        return [{ label: '@param', insertText: '@param$0', detail: 'Document a parameter' }];
    }
    const suggestions: TagSuggestion[] = [];
    for (const parameter of parameters) {
        const label = context.kind === 'parameter' ? parameter : `@param ${parameter}`;
        const description = context.hasDescription ? '' : ' ${1:description}';
        suggestions.push({
            label,
            insertText: `${escapeSnippet(label)}${description}$0`,
            detail: parameter.startsWith('<') ? 'Document a type parameter' : 'Document a parameter',
        });
    }
    return suggestions;
}

function createTagSuggestions(token: Token, declaration: JavadocDeclaration, documented: DocumentedTags, context: TagContext): TagSuggestion[] {
    const definitions: TagDefinition[] = [];
    if (declaration.returnsValue) {
        definitions.push({ name: 'return', content: ' ${1:description}', detail: 'Describe the returned value' });
    }
    if (token.type === 'method') {
        definitions.push(...methodTags);
    }
    definitions.push(...commonTags);
    if (token.type === 'class') {
        definitions.push(...classTags);
    }
    const suggestions: TagSuggestion[] = [];
    for (const definition of definitions) {
        if (!definition.repeatable && documented.tags.has(definition.name)) {
            continue;
        }
        const content = context.hasDescription ? '' : definition.content;
        suggestions.push({
            label: `@${definition.name}`,
            insertText: `@${definition.name}${content}$0`,
            detail: definition.detail,
        });
    }
    return suggestions;
}

export class JavadocTagCompletionProvider implements languages.CompletionItemProvider {
    readonly triggerCharacters = ['@', ' ', '<', '.'];
    private readonly declaration: JavadocDeclaration;
    private readonly token: Token;
    private readonly model: editor.ITextModel;
    private readonly exceptions: string[];

    constructor(result: DecompileResult, token: Token, model: editor.ITextModel) {
        this.declaration = getJavadocDeclaration(result, token);
        this.exceptions = getDeclaredExceptions(result, token);
        this.token = token;
        this.model = model;
    }

    provideCompletionItems(model: editor.ITextModel, position: Position): languages.CompletionList {
        if (model !== this.model) {
            return { suggestions: [] };
        }
        const context = getTagContext(model, position);
        if (!context) {
            return { suggestions: [] };
        }
        const documented = collectDocumentedTags(model, position.lineNumber);
        const missingParameters = [...this.declaration.typeParameters, ...this.declaration.parameters]
            .filter(parameter => !documented.parameters.has(parameter));
        const missingExceptions = this.exceptions.filter(exception => !isExceptionDocumented(exception, documented.exceptions));
        const suggestions: TagSuggestion[] = [];
        if (context.kind !== 'exception') {
            suggestions.push(...createParameterSuggestions(missingParameters, context));
        }
        if (context.kind !== 'parameter') {
            suggestions.push(...createExceptionSuggestions(missingExceptions, context));
        }
        if (context.kind === 'tag') {
            suggestions.push(...createTagSuggestions(this.token, this.declaration, documented, context));
        }
        return {
            suggestions: suggestions.map((suggestion, index) => ({
                ...suggestion,
                filterText: suggestion.filterText ?? suggestion.label,
                insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
                kind: languages.CompletionItemKind.Snippet,
                range: context.range,
                sortText: String(index).padStart(2, '0'),
            })),
        };
    }
}
