export interface ClassFile {
    minorVersion: number;
    majorVersion: number;
    constantPool: ConstantPoolEntry[];
    accessFlags: number;
    thisClass: number;
    superClass: number;
    interfaces: number[];
    fields: FieldInfo[];
    methods: MethodInfo[];
    attributes: AttributeInfo[];
}

export interface FieldInfo {
    accessFlags: number;
    nameIndex: number;
    descriptorIndex: number;
    attributes: AttributeInfo[];
}

export interface MethodInfo {
    accessFlags: number;
    nameIndex: number;
    descriptorIndex: number;
    attributes: AttributeInfo[];
}

export interface AttributeInfo {
    nameIndex: number;
    info: Uint8Array;
}

export type ConstantPoolEntry =
    | { tag: 1; value: string; } // Utf8
    | { tag: 3; value: number; } // Integer
    | { tag: 4; value: number; } // Float
    | { tag: 5; value: bigint; } // Long
    | { tag: 6; value: number; } // Double
    | { tag: 7; nameIndex: number; } // Class
    | { tag: 8; stringIndex: number; } // String
    | { tag: 9; classIndex: number; nameAndTypeIndex: number; } // Fieldref
    | { tag: 10; classIndex: number; nameAndTypeIndex: number; } // Methodref
    | { tag: 11; classIndex: number; nameAndTypeIndex: number; } // InterfaceMethodref
    | { tag: 12; nameIndex: number; descriptorIndex: number; } // NameAndType
    | { tag: 15; referenceKind: number; referenceIndex: number; } // MethodHandle
    | { tag: 16; descriptorIndex: number; } // MethodType
    | { tag: 18; bootstrapMethodAttrIndex: number; nameAndTypeIndex: number; }; // InvokeDynamic

class DataReader {
    private offset = 0;
    private data: Uint8Array;

    constructor(data: Uint8Array) {
        this.data = data;
    }

    readU1(): number {
        return this.data[this.offset++];
    }

    readU2(): number {
        const value = (this.data[this.offset] << 8) | this.data[this.offset + 1];
        this.offset += 2;
        return value;
    }

    readU4(): number {
        const value = (this.data[this.offset] << 24) |
            (this.data[this.offset + 1] << 16) |
            (this.data[this.offset + 2] << 8) |
            this.data[this.offset + 3];
        this.offset += 4;
        return value >>> 0; // Convert to unsigned
    }

    readU8(): bigint {
        const high = BigInt(this.readU4());
        const low = BigInt(this.readU4());
        return (high << 32n) | low;
    }

    readBytes(length: number): Uint8Array {
        const bytes = this.data.slice(this.offset, this.offset + length);
        this.offset += length;
        return bytes;
    }

    readUtf8(): string {
        const length = this.readU2();
        const bytes = this.readBytes(length);
        return new TextDecoder('utf-8').decode(bytes);
    }
}

export async function parseClassFile(bytes: Uint8Array): Promise<ClassFile> {
    const reader = new DataReader(bytes);

    // Magic number
    const magic = reader.readU4();
    if (magic !== 0xCAFEBABE) {
        throw new Error('Invalid class file magic number');
    }

    // Version
    const minorVersion = reader.readU2();
    const majorVersion = reader.readU2();

    // Constant pool
    const constantPoolCount = reader.readU2();
    const constantPool: ConstantPoolEntry[] = [null as any]; // Index 0 is reserved

    for (let i = 1; i < constantPoolCount; i++) {
        const tag = reader.readU1();

        switch (tag) {
            case 1: // CONSTANT_Utf8
                constantPool[i] = { tag: 1, value: reader.readUtf8() };
                break;
            case 3: // CONSTANT_Integer
                constantPool[i] = { tag: 3, value: reader.readU4() };
                break;
            case 4: // CONSTANT_Float
                constantPool[i] = { tag: 4, value: reader.readU4() };
                break;
            case 5: // CONSTANT_Long
                constantPool[i] = { tag: 5, value: reader.readU8() };
                i++; // Long takes two slots
                break;
            case 6: // CONSTANT_Double
                constantPool[i] = { tag: 6, value: reader.readU4() };
                reader.readU4(); // Read second half
                i++; // Double takes two slots
                break;
            case 7: // CONSTANT_Class
                constantPool[i] = { tag: 7, nameIndex: reader.readU2() };
                break;
            case 8: // CONSTANT_String
                constantPool[i] = { tag: 8, stringIndex: reader.readU2() };
                break;
            case 9: // CONSTANT_Fieldref
                constantPool[i] = { tag: 9, classIndex: reader.readU2(), nameAndTypeIndex: reader.readU2() };
                break;
            case 10: // CONSTANT_Methodref
                constantPool[i] = { tag: 10, classIndex: reader.readU2(), nameAndTypeIndex: reader.readU2() };
                break;
            case 11: // CONSTANT_InterfaceMethodref
                constantPool[i] = { tag: 11, classIndex: reader.readU2(), nameAndTypeIndex: reader.readU2() };
                break;
            case 12: // CONSTANT_NameAndType
                constantPool[i] = { tag: 12, nameIndex: reader.readU2(), descriptorIndex: reader.readU2() };
                break;
            case 15: // CONSTANT_MethodHandle
                constantPool[i] = { tag: 15, referenceKind: reader.readU1(), referenceIndex: reader.readU2() };
                break;
            case 16: // CONSTANT_MethodType
                constantPool[i] = { tag: 16, descriptorIndex: reader.readU2() };
                break;
            case 18: // CONSTANT_InvokeDynamic
                constantPool[i] = { tag: 18, bootstrapMethodAttrIndex: reader.readU2(), nameAndTypeIndex: reader.readU2() };
                break;
            default:
                throw new Error(`Unknown constant pool tag: ${tag}`);
        }
    }

    // Access flags, this class, super class
    const accessFlags = reader.readU2();
    const thisClass = reader.readU2();
    const superClass = reader.readU2();

    // Interfaces
    const interfacesCount = reader.readU2();
    const interfaces: number[] = [];
    for (let i = 0; i < interfacesCount; i++) {
        interfaces.push(reader.readU2());
    }

    // Fields
    const fieldsCount = reader.readU2();
    const fields: FieldInfo[] = [];
    for (let i = 0; i < fieldsCount; i++) {
        fields.push(readFieldInfo(reader));
    }

    // Methods
    const methodsCount = reader.readU2();
    const methods: MethodInfo[] = [];
    for (let i = 0; i < methodsCount; i++) {
        methods.push(readMethodInfo(reader));
    }

    // Attributes
    const attributesCount = reader.readU2();
    const attributes: AttributeInfo[] = [];
    for (let i = 0; i < attributesCount; i++) {
        attributes.push(readAttributeInfo(reader));
    }

    return {
        minorVersion,
        majorVersion,
        constantPool,
        accessFlags,
        thisClass,
        superClass,
        interfaces,
        fields,
        methods,
        attributes
    };
}

function readFieldInfo(reader: DataReader): FieldInfo {
    const accessFlags = reader.readU2();
    const nameIndex = reader.readU2();
    const descriptorIndex = reader.readU2();

    const attributesCount = reader.readU2();
    const attributes: AttributeInfo[] = [];
    for (let i = 0; i < attributesCount; i++) {
        attributes.push(readAttributeInfo(reader));
    }

    return { accessFlags, nameIndex, descriptorIndex, attributes };
}

function readMethodInfo(reader: DataReader): MethodInfo {
    const accessFlags = reader.readU2();
    const nameIndex = reader.readU2();
    const descriptorIndex = reader.readU2();

    const attributesCount = reader.readU2();
    const attributes: AttributeInfo[] = [];
    for (let i = 0; i < attributesCount; i++) {
        attributes.push(readAttributeInfo(reader));
    }

    return { accessFlags, nameIndex, descriptorIndex, attributes };
}

function readAttributeInfo(reader: DataReader): AttributeInfo {
    const nameIndex = reader.readU2();
    const length = reader.readU4();
    const info = reader.readBytes(length);

    return { nameIndex, info };
}

// Helper functions to extract names from constant pool
export function getUtf8(constantPool: ConstantPoolEntry[], index: number): string {
    const entry = constantPool[index];
    if (entry && entry.tag === 1) {
        return entry.value;
    }
    return '';
}

export function getClassName(constantPool: ConstantPoolEntry[], index: number): string {
    const entry = constantPool[index];
    if (entry && entry.tag === 7) {
        return getUtf8(constantPool, entry.nameIndex);
    }
    return '';
}

export interface SearchOptions {
    constantPool?: boolean;
    fields?: boolean;
    methods?: boolean;
}

export function classContainsString(classFile: ClassFile, searchString: string, options?: SearchOptions): boolean {
    const lowerSearch = searchString.toLowerCase();

    // Default to searching everywhere if no options provided
    const searchOptions: SearchOptions = {
        constantPool: true,
        fields: true,
        methods: true,
        ...options
    };

    // Search through all UTF-8 constants in the constant pool (includes string literals)
    if (searchOptions.constantPool) {
        for (const entry of classFile.constantPool) {
            if (!entry) continue;

            if (entry.tag === 1) { // CONSTANT_Utf8
                if (entry.value.toLowerCase().includes(lowerSearch)) {
                    return true;
                }
            }
        }
    }

    // Search field names and descriptors
    if (searchOptions.fields) {
        for (const field of classFile.fields) {
            const fieldName = getUtf8(classFile.constantPool, field.nameIndex);
            const fieldDescriptor = getUtf8(classFile.constantPool, field.descriptorIndex);

            if (fieldName.toLowerCase().includes(lowerSearch) ||
                fieldDescriptor.toLowerCase().includes(lowerSearch)) {
                return true;
            }
        }
    }

    // Search method names and descriptors
    if (searchOptions.methods) {
        for (const method of classFile.methods) {
            const methodName = getUtf8(classFile.constantPool, method.nameIndex);
            const methodDescriptor = getUtf8(classFile.constantPool, method.descriptorIndex);

            if (methodName.toLowerCase().includes(lowerSearch) ||
                methodDescriptor.toLowerCase().includes(lowerSearch)) {
                return true;
            }
        }
    }

    return false;
}

export function getAllStrings(classFile: ClassFile): string[] {
    const strings: string[] = [];

    for (const entry of classFile.constantPool) {
        if (!entry) continue;

        if (entry.tag === 1) { // CONSTANT_Utf8
            strings.push(entry.value);
        }
    }

    return strings;
}