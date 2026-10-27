import type { MemberToken, ParameterToken, Token } from '../logic/Tokens';
import type { DecompileResult } from '../workers/decompile/types';

export interface JavadocDeclaration {
    parameters: string[];
    typeParameters: string[];
    returnsValue: boolean;
}

function closingDelimiter(source: string, start: number, open: string, close: string): number {
    let depth = 0;
    for (let index = start; index < source.length; index++) {
        if (source[index] === open) {
            depth++;
        }
        if (source[index] === close) {
            depth--;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function splitParameters(source: string): string[] {
    const parameters: string[] = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < source.length; index++) {
        if (source[index] === '<') {
            depth++;
        }
        if (source[index] === '>') {
            depth--;
        }
        if (source[index] === ',' && depth === 0) {
            parameters.push(source.slice(start, index).trim());
            start = index + 1;
        }
    }
    parameters.push(source.slice(start).trim());
    return parameters.filter(Boolean);
}

function stripAnnotations(source: string): string {
    const pieces: string[] = [];
    let start = 0;
    for (const match of source.matchAll(/@[\p{ID_Start}_$][\p{ID_Continue}$.]*/gu)) {
        if (match.index < start) {
            continue;
        }
        let end = match.index + match[0].length;
        const argumentsStart = skipWhitespace(source, end);
        if (source[argumentsStart] === '(') {
            const argumentsEnd = closingDelimiter(source, argumentsStart, '(', ')');
            if (argumentsEnd >= 0) {
                end = argumentsEnd + 1;
            }
        }
        pieces.push(source.slice(start, match.index), source.slice(match.index, end).replace(/[^\n]/g, ' '));
        start = end;
    }
    pieces.push(source.slice(start));
    return pieces.join('');
}

function maskCommentsAndLiterals(source: string): string {
    // Preserve offsets so declaration tokens still point to the same characters.
    return source.replace(/\/\*[^]*?\*\/|\/\/[^\n]*|"""[^]*?"""|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
        match => match.replace(/[^\n]/g, ' '));
}

function skipWhitespace(source: string, start: number): number {
    let index = start;
    while (index < source.length && /\s/.test(source[index])) {
        index++;
    }
    return index;
}

function readTypeParameters(source: string, start: number): { names: string[]; end: number } {
    if (source[start] !== '<') {
        return { names: [], end: start };
    }
    const closingBracket = closingDelimiter(source, start, '<', '>');
    if (closingBracket < 0) {
        return { names: [], end: start };
    }
    const names: string[] = [];
    for (const parameter of splitParameters(source.slice(start + 1, closingBracket))) {
        const name = /^[\p{ID_Start}_$][\p{ID_Continue}$]*/u.exec(parameter)?.[0];
        if (name) {
            names.push(`<${name}>`);
        }
    }
    return { names, end: closingBracket + 1 };
}

function readParameterNames(source: string, start: number): string[] {
    const openingBracket = skipWhitespace(source, start);
    if (source[openingBracket] !== '(') {
        return [];
    }
    const closingBracket = closingDelimiter(source, openingBracket, '(', ')');
    if (closingBracket < 0) {
        return [];
    }
    const names: string[] = [];
    for (const parameter of splitParameters(source.slice(openingBracket + 1, closingBracket))) {
        const name = /([\p{ID_Start}_$][\p{ID_Continue}$]*)\s*(?:\[\s*\]\s*)*$/u.exec(parameter)?.[1];
        if (name && name !== 'this') {
            names.push(name);
        }
    }
    return names;
}

function readMethodParameterNames(result: DecompileResult, method: MemberToken): string[] | undefined {
    const parameters: ParameterToken[] = [];
    for (const token of result.tokens) {
        if (token.type === 'parameter' && token.declaration
            && token.className === method.className && token.methodName === method.name
            && token.methodDescriptor === method.descriptor && token.name && token.name !== 'this') {
            parameters.push(token);
        }
    }
    if (parameters.length === 0) {
        // Older cached decompilations do not contain parameter metadata.
        return undefined;
    }
    parameters.sort((left, right) => left.index - right.index);
    return parameters.map(parameter => parameter.name);
}

function getDeclarationHeader(source: string, token: Token): { header: string; start: number } {
    const beforeName = source.slice(0, token.start);
    const boundary = Math.max(beforeName.lastIndexOf('{'), beforeName.lastIndexOf('}'), beforeName.lastIndexOf(';'));
    return { header: beforeName.slice(boundary + 1), start: skipWhitespace(source, boundary + 1) };
}

/** Reads parameter metadata and the generic declarations erased from JVM descriptors. */
export function getJavadocDeclaration(result: DecompileResult, token: Token): JavadocDeclaration {
    const declaration: JavadocDeclaration = {
        parameters: [],
        typeParameters: [],
        returnsValue: token.type === 'method' && token.name !== '<init>' && !token.descriptor.endsWith(')V'),
    };
    if (token.type !== 'class' && token.type !== 'method') {
        return declaration;
    }
    const source = stripAnnotations(maskCommentsAndLiterals(result.source));
    const { header, start } = getDeclarationHeader(source, token);
    const afterName = skipWhitespace(source, token.start + token.length);
    if (token.type === 'class') {
        const typeParameters = readTypeParameters(source, afterName);
        declaration.typeParameters = typeParameters.names;
        if (/\brecord\s*$/.test(header)) {
            declaration.parameters = readParameterNames(source, typeParameters.end);
        }
        return declaration;
    }
    if (token.type === 'method') {
        const modifiers = /^(?:(?:public|protected|private|static|final|abstract|synchronized|native|strictfp|default)\s+)*/;
        const modifierLength = modifiers.exec(source.slice(start))![0].length;
        declaration.typeParameters = readTypeParameters(source, start + modifierLength).names;
        declaration.parameters = readMethodParameterNames(result, token) ?? readParameterNames(source, afterName);
    }
    return declaration;
}
