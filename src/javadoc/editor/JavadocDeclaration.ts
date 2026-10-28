import type { MemberToken, ParameterToken, Token } from '../../logic/Tokens';
import type { DecompileResult } from '../../workers/decompile/types';

export interface DeclarationMetadata {
    typeParameters: string[];
    exceptions: string[];
    recordComponents: string[];
}

export interface JavadocDeclaration {
    type: Token['type'];
    exceptions: string[];
    parameters: string[];
    typeParameters: string[];
    returnsValue: boolean;
}

function readMethodParameterNames(result: DecompileResult, method: MemberToken): string[] {
    const parameters: ParameterToken[] = [];
    for (const token of result.tokens) {
        if (token.type === 'parameter' && token.declaration
            && token.className === method.className && token.methodName === method.name
            && token.methodDescriptor === method.descriptor && token.name && token.name !== 'this') {
            parameters.push(token);
        }
    }
    parameters.sort((left, right) => left.index - right.index);
    return parameters.map(parameter => parameter.name);
}

/** Combines bytecode declaration metadata with the parameter names displayed by the decompiler. */
export function getJavadocDeclaration(result: DecompileResult, token: Token, metadata: DeclarationMetadata): JavadocDeclaration {
    let parameters: string[] = [];
    if (token.type === 'class') {
        parameters = metadata.recordComponents;
    } else if (token.type === 'method') {
        parameters = readMethodParameterNames(result, token);
    }
    return {
        type: token.type,
        parameters,
        exceptions: metadata.exceptions,
        typeParameters: metadata.typeParameters.map(name => `<${name}>`),
        returnsValue: token.type === 'method' && token.name !== '<init>' && !token.descriptor.endsWith(')V'),
    };
}
