import { languages, type editor, type Position, type CancellationToken } from 'monaco-editor';
import type { Token } from '../../logic/Tokens';
import type { DecompileResult } from '../../workers/decompile/types';
import type { JarIndex } from '../../workers/jar-index/client';
import type { ClassName } from '../../utils/Names';
import { parseFieldDescriptor, parseMethodDescriptor } from '../../utils/JavaDescriptors';
import { getJavadocForToken } from '../Javadoc';
import { getJavadocReference, type JavadocReference } from './JavadocReference';
import { escapeSnippet, getCompletionRange, type CompletionRange } from './JavadocCompletionUtils';
import { JavadocSymbols, simpleName, sourceName, type InheritedMember } from './JavadocSymbols';

interface ReferenceCompletionItem extends languages.CompletionItem {
    target: Token;
}

interface ReferenceContext {
    reference: JavadocReference;
    range: CompletionRange;
}

function escapeReference(reference: string, syntax: JavadocReference['syntax']): string {
    if (syntax === 'see') return reference;

    return reference.replace(/[[\]]/g, '\\$&');
}

function createReferenceSnippet(text: string, reference: JavadocReference): string {
    const escaped = escapeSnippet(escapeReference(text, reference.syntax));
    if (reference.syntax === 'see') return `${escaped}$0`;

    const closingBracket = reference.hasClosingBracket || reference.hasMemberSuffix ? '' : ']';
    return `${escaped}$0${closingBracket}`;
}

function shortType(type: string): string {
    return type.replace(/(?:[\w$]+\.)+([\w$]+)/g, '$1');
}

export class JavadocCompletionProvider implements languages.CompletionItemProvider {
    readonly triggerCharacters = ['[', '#', '.', '(', ',', ' '];
    private readonly symbols: JavadocSymbols;
    private readonly model: editor.ITextModel;

    constructor(result: DecompileResult, owner: ClassName, index: JarIndex | undefined, model: editor.ITextModel) {
        this.symbols = new JavadocSymbols(result, owner, index);
        this.model = model;
    }

    async provideCompletionItems(
        model: editor.ITextModel,
        position: Position,
        _context: languages.CompletionContext,
        cancellation: CancellationToken,
    ): Promise<languages.CompletionList> {
        if (model !== this.model) {
            return { suggestions: [] };
        }
        const reference = getJavadocReference(model, position);
        if (!reference) {
            return { suggestions: [] };
        }
        const version = model.getVersionId();
        await this.symbols.ready;
        if (cancellation.isCancellationRequested || model.isDisposed() || model.getVersionId() !== version) {
            return { suggestions: [] };
        }
        const context: ReferenceContext = {
            reference,
            range: getCompletionRange(position, reference.startColumn, reference.endColumn),
        };
        if (reference.prefix.includes('#')) {
            return { suggestions: this.createMemberSuggestions(context) };
        }
        return { suggestions: [...this.symbols.classNames].map(className => this.createClassSuggestion(className, context)) };
    }

    resolveCompletionItem(item: languages.CompletionItem): languages.CompletionItem {
        const target = (item as ReferenceCompletionItem).target;
        if (target) {
            const documentation = getJavadocForToken(target);
            if (documentation) {
                item.documentation = { value: documentation.slice(0, 600), isTrusted: false };
            }
        }
        return item;
    }

    private createClassSuggestion(className: ClassName, context: ReferenceContext): ReferenceCompletionItem {
        const qualifiedName = sourceName(className);
        const qualified = context.reference.prefix.includes('.');
        const referenceName = qualified ? qualifiedName : this.symbols.referenceName(className);
        return {
            label: { label: simpleName(className), description: qualifiedName },
            kind: languages.CompletionItemKind.Class,
            detail: qualifiedName,
            insertText: createReferenceSnippet(referenceName, context.reference),
            insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: qualified ? qualifiedName : simpleName(className),
            sortText: `${this.symbols.classRank(className)}:${simpleName(className)}:${className}`,
            range: context.range,
            target: { type: 'class', className, declaration: true, start: 0, length: 0 },
        };
    }

    private createMemberSuggestions(context: ReferenceContext): ReferenceCompletionItem[] {
        const classReference = context.reference.prefix.split('#')[0];
        const className = classReference ? this.symbols.resolveClass(classReference) : this.symbols.owner;
        if (!className) {
            return [];
        }
        return this.symbols.getMembers(className).map(candidate => this.createMemberSuggestion(candidate, classReference, context));
    }

    private createMemberSuggestion(candidate: InheritedMember, classReference: string, context: ReferenceContext): ReferenceCompletionItem {
        const { member, inherited } = candidate;
        const constructor = member.type === 'method' && member.name === '<init>';
        const name = constructor ? simpleName(member.className) : member.name;
        let label = name;
        let reference = `${classReference}#${name}`;
        let kind = languages.CompletionItemKind.Field;
        let detail: string;
        if (member.type === 'method') {
            const descriptor = parseMethodDescriptor(member.descriptor);
            const parameterTypes = descriptor.parameterTypes.map(type => type.replaceAll('$', '.'));
            const returnType = descriptor.returnType.replaceAll('$', '.');
            label += `(${parameterTypes.map(shortType).join(', ')})`;
            reference += `(${parameterTypes.join(', ')})`;
            detail = `${name}(${parameterTypes.join(', ')})`;
            if (constructor) {
                kind = languages.CompletionItemKind.Constructor;
            } else {
                kind = languages.CompletionItemKind.Method;
                label += ` → ${shortType(returnType)}`;
                detail += ` → ${returnType}`;
            }
        } else {
            const fieldType = parseFieldDescriptor(member.descriptor).replaceAll('$', '.');
            detail = `${fieldType} — ${sourceName(member.className)}`;
        }
        return {
            label: { label, description: sourceName(member.className) },
            kind,
            detail,
            insertText: createReferenceSnippet(reference, context.reference),
            insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: escapeReference(reference, context.reference.syntax),
            sortText: `${inherited ? '1' : '0'}:${name}:${member.descriptor}`,
            range: context.range,
            target: member,
        };
    }
}
