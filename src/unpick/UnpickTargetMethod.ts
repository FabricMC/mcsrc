import { toDottedClassName, type DottedClassName } from "../utils/Names";
import type { UnpickSymbols } from "./UnpickSymbolCompletionProvider";

interface TargetMethod {
    owner: DottedClassName;
    name: string;
    descriptor: string;
    endColumn: number;
}

export function parseTargetMethod(line: string): TargetMethod | undefined {
    const match = line.match(/^target_method[ \t]+([\w$.]+)[ \t]+([\w$<>]+)[ \t]+(\([^ \t#]*\)[^ \t#]+)/);
    if (!match) return;
    const [, owner, name, descriptor] = match;
    return { owner: toDottedClassName(owner), name, descriptor, endColumn: match[0].length + 1 };
}

export async function findTargetMethod(target: TargetMethod, members: UnpickSymbols["members"]) {
    const methods = await members(target.owner);
    return methods.find(member => member.kind === "method" && member.name === target.name && member.descriptor === target.descriptor);
}
