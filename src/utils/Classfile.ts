// A minimal Java class file parser to extract high-level information.

export interface Classfile {
    name: string;
    superName: string | null;
    interfaces: string[];
}

type ConstantPoolEntry =
    | { tag: 1; value: string; }  // CONSTANT_Utf8
    | { tag: 3; value: number; }  // CONSTANT_Integer
    | { tag: 4; value: number; }  // CONSTANT_Float
    | { tag: 5; value: bigint; }  // CONSTANT_Long
    | { tag: 6; value: number; }  // CONSTANT_Double
    | { tag: 7; nameIndex: number; }  // CONSTANT_Class
    | { tag: 8; stringIndex: number; }  // CONSTANT_String
    | { tag: 9; classIndex: number; nameAndTypeIndex: number; }  // CONSTANT_Fieldref
    | { tag: 10; classIndex: number; nameAndTypeIndex: number; }  // CONSTANT_Methodref
    | { tag: 11; classIndex: number; nameAndTypeIndex: number; }  // CONSTANT_InterfaceMethodref
    | { tag: 12; nameIndex: number; descriptorIndex: number; }  // CONSTANT_NameAndType
    | { tag: 15; referenceKind: number; referenceIndex: number; }  // CONSTANT_MethodHandle
    | { tag: 16; descriptorIndex: number; }  // CONSTANT_MethodType
    | { tag: 17; bootstrapMethodAttrIndex: number; nameAndTypeIndex: number; }  // CONSTANT_Dynamic
    | { tag: 18; bootstrapMethodAttrIndex: number; nameAndTypeIndex: number; }  // CONSTANT_InvokeDynamic
    | { tag: 19; nameIndex: number; }  // CONSTANT_Module
    | { tag: 20; nameIndex: number; }  // CONSTANT_Package
    | null;  // Placeholder for Long/Double second slot

export function parseClassfile(data: Uint8Array): Classfile {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;

    const magic = view.getUint32(offset);
    offset += 4;
    if (magic !== 0xCAFEBABE) {
        throw new Error('Invalid class file magic number');
    }

    // Skip minor and major version
    offset += 4;

    const constantPoolCount = view.getUint16(offset);
    offset += 2;

    const constantPool: ConstantPoolEntry[] = [null]; // 1-indexed
    for (let i = 1; i < constantPoolCount; i++) {
        const tag = view.getUint8(offset);
        offset += 1;

        switch (tag) {
            case 1: { // CONSTANT_Utf8
                const length = view.getUint16(offset);
                offset += 2;
                const bytes = data.slice(offset, offset + length);
                const text = new TextDecoder('utf-8').decode(bytes);
                constantPool.push({ tag: 1, value: text });
                offset += length;
                break;
            }
            case 3: // CONSTANT_Integer
                constantPool.push({ tag: 3, value: view.getInt32(offset) });
                offset += 4;
                break;
            case 4: // CONSTANT_Float
                constantPool.push({ tag: 4, value: view.getFloat32(offset) });
                offset += 4;
                break;
            case 5: // CONSTANT_Long
                constantPool.push({ tag: 5, value: view.getBigInt64(offset) });
                offset += 8;
                constantPool.push(null); // Long takes 2 slots
                i++;
                break;
            case 6: // CONSTANT_Double
                constantPool.push({ tag: 6, value: view.getFloat64(offset) });
                offset += 8;
                constantPool.push(null); // Double takes 2 slots
                i++;
                break;
            case 7: { // CONSTANT_Class
                const nameIndex = view.getUint16(offset);
                constantPool.push({ tag: 7, nameIndex });
                offset += 2;
                break;
            }
            case 8: { // CONSTANT_String
                const stringIndex = view.getUint16(offset);
                constantPool.push({ tag: 8, stringIndex });
                offset += 2;
                break;
            }
            case 9: // CONSTANT_Fieldref
            case 10: // CONSTANT_Methodref
            case 11: { // CONSTANT_InterfaceMethodref
                const classIndex = view.getUint16(offset);
                const nameAndTypeIndex = view.getUint16(offset + 2);
                constantPool.push({ tag, classIndex, nameAndTypeIndex });
                offset += 4;
                break;
            }
            case 12: { // CONSTANT_NameAndType
                const nameIndex = view.getUint16(offset);
                const descriptorIndex = view.getUint16(offset + 2);
                constantPool.push({ tag: 12, nameIndex, descriptorIndex });
                offset += 4;
                break;
            }
            case 15: { // CONSTANT_MethodHandle
                const referenceKind = view.getUint8(offset);
                const referenceIndex = view.getUint16(offset + 1);
                constantPool.push({ tag: 15, referenceKind, referenceIndex });
                offset += 3;
                break;
            }
            case 16: { // CONSTANT_MethodType
                const descriptorIndex = view.getUint16(offset);
                constantPool.push({ tag: 16, descriptorIndex });
                offset += 2;
                break;
            }
            case 17: { // CONSTANT_Dynamic
                const bootstrapMethodAttrIndex = view.getUint16(offset);
                const nameAndTypeIndex = view.getUint16(offset + 2);
                constantPool.push({ tag: 17, bootstrapMethodAttrIndex, nameAndTypeIndex });
                offset += 4;
                break;
            }
            case 18: { // CONSTANT_InvokeDynamic
                const bootstrapMethodAttrIndex = view.getUint16(offset);
                const nameAndTypeIndex = view.getUint16(offset + 2);
                constantPool.push({ tag: 18, bootstrapMethodAttrIndex, nameAndTypeIndex });
                offset += 4;
                break;
            }
            case 19: { // CONSTANT_Module
                const nameIndex = view.getUint16(offset);
                constantPool.push({ tag: 19, nameIndex });
                offset += 2;
                break;
            }
            case 20: { // CONSTANT_Package
                const nameIndex = view.getUint16(offset);
                constantPool.push({ tag: 20, nameIndex });
                offset += 2;
                break;
            }
            default:
                throw new Error(`Unknown constant pool tag: ${tag}`);
        }
    }

    const getClassName = (index: number): string => {
        const classInfo = constantPool[index];
        if (!classInfo || classInfo.tag !== 7) {
            throw new Error('Invalid class reference');
        }
        const utf8Info = constantPool[classInfo.nameIndex];
        if (!utf8Info || utf8Info.tag !== 1) {
            throw new Error('Invalid UTF8 reference');
        }
        return utf8Info.value;
    };

    // Skip access flags
    offset += 2;

    // Read this_class
    const thisClass = view.getUint16(offset);
    offset += 2;
    const name = getClassName(thisClass);

    // Read super_class
    const superClassIndex = view.getUint16(offset);
    offset += 2;
    const superName = superClassIndex === 0 ? null : getClassName(superClassIndex);

    // Read interfaces count
    const interfacesCount = view.getUint16(offset);
    offset += 2;

    // Read interfaces
    const interfaces: string[] = [];
    for (let i = 0; i < interfacesCount; i++) {
        const interfaceIndex = view.getUint16(offset);
        offset += 2;
        interfaces.push(getClassName(interfaceIndex));
    }

    return { name, superName, interfaces };
}