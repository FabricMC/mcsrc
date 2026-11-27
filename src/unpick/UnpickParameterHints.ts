import { languages, type editor } from "monaco-editor";
import { parseMethodDescriptor } from "../utils/JavaDescriptors";
import { blockHeader } from "./UnpickCompletionProvider";
import type { UnpickSymbols } from "./UnpickSymbolCompletionProvider";
import { findTargetMethod, parseTargetMethod } from "./UnpickTargetMethod";

const parameter = /^[ \t]+param[ \t]+(?<index>0[xX][\da-fA-F]+|0[bB][01]+|0[0-7]*|[1-9]\d*)(?=[ \t#]|$)/;

export function unpickParameterHints(model: editor.ITextModel, members: UnpickSymbols["members"]): languages.InlayHintsProvider {
    return {
        async provideInlayHints(activeModel, range, cancellation) {
            if (activeModel !== model || cancellation.isCancellationRequested) return;
            const pending: Promise<languages.InlayHint | undefined>[] = [];
            let target = parseTargetMethod(blockHeader(model, range.startLineNumber));

            for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
                const line = model.getLineContent(lineNumber);
                if (/^[^ \t#]/.test(line)) {
                    target = parseTargetMethod(line);
                }

                const match = target && line.match(parameter);
                if (!target || !match?.groups) continue;
                const { index } = match.groups;
                const argument = /^0[0-7]+$/.test(index) ? Number.parseInt(index, 8) : Number(index);
                const position = { lineNumber, column: match[0].length + 1 };

                pending.push(findTargetMethod(target, members).then(method => {
                    if (!method) return;
                    const parameterName = method.parameterNames[argument];
                    if (!parameterName) return;
                    const type = parseMethodDescriptor(method.descriptor).parameterTypes[argument];
                    return {
                        label: parameterName,
                        tooltip: type ? `${type} ${parameterName}` : parameterName,
                        position,
                        kind: languages.InlayHintKind.Parameter,
                        paddingLeft: true,
                        paddingRight: true,
                    };
                }));
            }

            const hints = (await Promise.all(pending)).filter(hint => hint !== undefined);
            if (cancellation.isCancellationRequested || model.isDisposed()) return;
            return { hints, dispose: () => undefined };
        },
    };
}
