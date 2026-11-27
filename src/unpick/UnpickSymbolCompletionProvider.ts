import { languages, type CancellationToken, type editor, type IPosition } from "monaco-editor";
import type { ClassMember } from "../../java/build/generated/teavm/js/mcsrc.js";
import { formatDescriptor, parseMethodDescriptor } from "../utils/JavaDescriptors";
import { simpleDottedClassName, type DottedClassName } from "../utils/Names";
import { blockHeader } from "./UnpickCompletionProvider";
import { findTargetMethod, parseTargetMethod } from "./UnpickTargetMethod";

export interface UnpickSymbols {
    classes(): Promise<ReadonlySet<DottedClassName>>;
    members(owner: DottedClassName): Promise<ClassMember[]>;
    currentClass(): DottedClassName | undefined;
}

const { Class, Field, Method } = languages.CompletionItemKind;
const MAX_CLASS_SUGGESTIONS = 100;

export function unpickSymbolCompletionProvider(model: editor.ITextModel, symbols: UnpickSymbols) {
    return {
        triggerCharacters: [" ", "."],

        async provideCompletionItems(activeModel, position: IPosition, _context, cancellation: CancellationToken) {
            if (activeModel !== model || cancellation.isCancellationRequested) return { suggestions: [] };
            const result = await completeSymbols(model, position, symbols);
            if (cancellation.isCancellationRequested || model.isDisposed()) {
                return { suggestions: [] };
            }
            return result;
        },
    } satisfies languages.CompletionItemProvider;
}

async function completeSymbols(model: editor.ITextModel, { lineNumber, column }: IPosition, symbols: UnpickSymbols): Promise<languages.CompletionList> {
    const line = model.getLineContent(lineNumber);
    const before = line.slice(0, column - 1);
    const after = line.slice(column - 1);
    const range = (prefix: string, suffix: string) => ({
        startLineNumber: lineNumber, startColumn: column - prefix.length,
        endLineNumber: lineNumber, endColumn: column + suffix.length,
    });

    const parameterPrefix = before.match(/^[ \t]+param[ \t]+([\w$]*)$/)?.[1];
    if (parameterPrefix !== undefined) {
        const target = parseTargetMethod(blockHeader(model, lineNumber));
        const method = target && await findTargetMethod(target, symbols.members);
        if (!method) return { suggestions: [] };

        const suffix = after.match(/^[\w$]*[ \t]*/)?.[0] ?? "";
        const spacing = suffix.match(/[ \t]+$/)?.[0] ?? " ";
        const command = /^(?:#|$)/.test(after.slice(suffix.length))
            ? { id: "editor.action.triggerSuggest", title: "Suggest Unpick groups" }
            : undefined;
        const { parameterTypes } = parseMethodDescriptor(method.descriptor);
        return {
            suggestions: parameterTypes.map((type, index) => {
                const name = method.parameterNames[index];
                const number = String(index);
                return {
                    label: { label: number, description: name ? `${name} · ${type}` : type },
                    filterText: name ? `${number} ${name}` : number,
                    sortText: number.padStart(3, "0"),
                    kind: languages.CompletionItemKind.Variable,
                    insertText: number + spacing,
                    range: range(parameterPrefix, suffix),
                    command,
                };
            }),
        };
    }

    const memberTarget = before.match(/^target_(method|field)[ \t]+([\w$.]+)[ \t]+([\w$<>]*)$/);
    if (memberTarget) {
        const [, kind, owner, prefix] = memberTarget;
        const descriptor = kind === "method" ? "\\([^ \\t#]*\\)[^ \\t#]+" : "\\[*(?:[BCDFIJSZ]|L[\\w$/]+;)";
        const suffix = after.match(new RegExp(`^[\\w$<>]*(?:[ \\t]+${descriptor}(?=[ \\t#]|$))?`))?.[0] ?? "";
        const members = await symbols.members(owner as DottedClassName);
        return {
            suggestions: members.filter(member => member.kind === kind).map(member => ({
                label: { label: member.name, description: formatDescriptor(member.descriptor) },
                insertText: `${member.name} ${member.descriptor}`,
                kind: kind === "method" ? Method : Field,
                range: range(prefix, suffix),
            })),
        };
    }

    const classTarget = before.match(/^target_(?:method|field|annotation)[ \t]+([\w$.]*)$/)?.[1];
    const groupToken = before.match(/^[ \t]+(?:[^"'#@]*[ \t(+*/%~&|^<>-])?([a-zA-Z_$][\w$.]*)$/)?.[1];
    const inGroup = groupToken !== undefined && /^group[ \t]/.test(blockHeader(model, lineNumber));
    const prefix = inGroup ? groupToken : classTarget;
    if (prefix === undefined) return { suggestions: [] };

    const suffix = after.match(/^[\w$.]*/)?.[0] ?? "";
    const replacement = range(prefix, suffix);
    const currentClass = symbols.currentClass();
    const classes = prefix ? await symbols.classes() : [];
    if (inGroup && prefix.includes(".")) {
        const separator = prefix.lastIndexOf(".");
        const owner = prefix.slice(0, separator) as DottedClassName;
        const owners = [...classes].filter(name => name === owner || simpleDottedClassName(name) === owner);
        if (owners.length) {
            const suggestions = await Promise.all(owners.map(async name => (await symbols.members(name))
                .filter(member => member.kind === "field" && member.isStatic)
                .map(member => ({
                    label: member.name,
                    detail: `${name} · ${formatDescriptor(member.descriptor)}`,
                    filterText: `${owner}.${member.name}`,
                    insertText: `${name}.${member.name}`,
                    kind: Field,
                    range: replacement,
                }))));
            return { suggestions: suggestions.flat() };
        }
    }

    const search = prefix.toLowerCase();
    const names = new Set(currentClass ? [currentClass, ...classes] : classes);
    const suggestions: languages.CompletionItem[] = [];
    for (const name of names) {
        const simpleName = simpleDottedClassName(name);
        const nestedName = simpleName.slice(simpleName.lastIndexOf("$") + 1);
        const match = [simpleName, nestedName, name].find(candidate => candidate.toLowerCase().startsWith(search));
        if (!match) continue;
        suggestions.push({
            label: { label: simpleName, description: name },
            filterText: match,
            sortText: `${name === currentClass ? "0" : "1"}:${simpleName}:${name}`,
            insertText: inGroup ? `${name}.` : name,
            kind: Class,
            range: replacement,
        });
        if (suggestions.length === MAX_CLASS_SUGGESTIONS) break;
    }
    return { suggestions, incomplete: true };
}
