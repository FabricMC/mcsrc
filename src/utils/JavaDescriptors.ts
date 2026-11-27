export interface MethodDescriptor {
    parameterTypes: string[];
    returnType: string;
}

const primitiveTypes: Record<string, string> = {
    V: 'void',
    Z: 'boolean',
    B: 'byte',
    C: 'char',
    S: 'short',
    I: 'int',
    J: 'long',
    F: 'float',
    D: 'double',
};

function readType(descriptor: string, start: number): { type: string; end: number } {
    let index = start;
    while (descriptor[index] === '[') {
        index++;
    }
    const arrayDepth = index - start;
    let type: string;
    let end: number;
    if (descriptor[index] === 'L') {
        end = descriptor.indexOf(';', index);
        if (end < 0) {
            throw new Error(`Invalid JVM descriptor: ${descriptor}`);
        }
        type = descriptor.slice(index + 1, end).replaceAll('/', '.');
        end++;
    } else {
        type = primitiveTypes[descriptor[index]];
        if (!type) {
            throw new Error(`Invalid JVM descriptor: ${descriptor}`);
        }
        end = index + 1;
    }
    return { type: type + '[]'.repeat(arrayDepth), end };
}

/** Parses the parameter and return types in a JVM method descriptor. */
export function parseMethodDescriptor(descriptor: string): MethodDescriptor {
    if (!descriptor.startsWith('(')) {
        throw new Error(`Invalid JVM method descriptor: ${descriptor}`);
    }
    const parameterTypes: string[] = [];
    let index = 1;
    while (descriptor[index] !== ')') {
        const parameter = readType(descriptor, index);
        parameterTypes.push(parameter.type);
        index = parameter.end;
    }
    return { parameterTypes, returnType: readType(descriptor, index + 1).type };
}

/** Parses the type in a JVM field descriptor. */
export function parseFieldDescriptor(descriptor: string): string {
    return readType(descriptor, 0).type;
}

/** Removes the package prefix from a parsed Java type. */
export function simpleTypeName(type: string): string {
    return type.slice(type.lastIndexOf('.') + 1);
}

/** Formats a JVM field or method descriptor for display. */
export function formatDescriptor(descriptor: string, formatType = (type: string) => type): string {
    if (!descriptor.startsWith('(')) {
        return formatType(parseFieldDescriptor(descriptor));
    }
    const { parameterTypes, returnType } = parseMethodDescriptor(descriptor);
    return `(${parameterTypes.map(formatType).join(', ')}) → ${formatType(returnType)}`;
}
