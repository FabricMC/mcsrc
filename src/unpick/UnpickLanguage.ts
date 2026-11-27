import type * as monaco from "monaco-editor";
import { unpickCompletionProvider } from "./UnpickCompletionProvider";

export const UNPICK_LANGUAGE = "unpick";

export function registerUnpickLanguage(editor: typeof monaco) {
    editor.languages.register({ id: UNPICK_LANGUAGE, aliases: ["Unpick"], extensions: [".unpick"] });
    editor.languages.registerCompletionItemProvider(UNPICK_LANGUAGE, unpickCompletionProvider);
    editor.languages.setMonarchTokensProvider(UNPICK_LANGUAGE, {
        identifier: /[a-zA-Z_$][\w$]*/,
        qualifiedName: /@identifier(?:\.@identifier)*/,
        fieldDescriptor: /\[*(?:[BCDFIJSZ]|L[\w$/]+;)/,
        keywords: ["group", "target_method", "target_field", "target_annotation", "param", "return", "instance"],
        types: ["byte", "short", "int", "long", "float", "double", "char", "String", "Class"],
        tokenizer: {
            root: [
                [/^unpick v4$/, "keyword"],
                [/#:.*/, "comment.doc"],
                [/#.*/, "comment"],
                [/"(?:[^"\\]|\\.)*"?/, "string"],
                [/'(?:[^'\\]|\\.)*'?/, "string"],
                [/([@]scope)([ \t]+)(package|class|method)\b/, ["annotation", "white", "keyword"]],
                [/([@]format)([ \t]+)(decimal|hex|binary|octal|char)\b/, ["annotation", "white", "keyword"]],
                [/@(?:scope|strict|format|flags)\b/, "annotation"],
                [/^(target_field)([ \t]+)(@qualifiedName)([ \t]+)(@identifier)([ \t]+)(@fieldDescriptor)(?=[ \t#]|$)/,
                    ["keyword", "white", "type.identifier", "white", "identifier", "white", "type.descriptor"]],
                [/\((?:@fieldDescriptor)*\)(?:V|@fieldDescriptor)(?=[ \t#]|$)/, "type.descriptor"],
                [/<(?:init|clinit)>/, "identifier"],
                [/0[xX][\da-fA-F]+[lL]?/, "number.hex"],
                [/0[bB][01]+[lL]?/, "number.binary"],
                [/\d+\.\d+(?:[eE][+-]?\d+)?[fF]?/, "number.float"],
                [/\d+[lL]?/, "number"],
                [/@identifier(?:\.@identifier)+/, "type.identifier"],
                [/@identifier/, { cases: { "@keywords": "keyword", "@types": "type", "@default": "identifier" } }],
                [/>>>|>>|<<|[+*/%~&|^-]/, "operator"],
                [/[()[\].:]/, "delimiter"],
                [/[ \t]+/, "white"],
            ],
        },
    });
}
