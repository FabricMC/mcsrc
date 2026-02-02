import type { Token } from "../logic/Tokens";
import type { Jar } from "../utils/Jar";

export interface DecompileResult {
    owner: string;
    className: string;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
}

type DecompileWorker = typeof import("./DecompileWorker");
function createWrorker() {
    return new ComlinkWorker<DecompileWorker>(
        new URL("./DecompileWorker", import.meta.url),
    );
}

const threads = navigator.hardwareConcurrency || 4;
const workers = Array.from({ length: threads }, () => createWrorker());

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    const worker = workers.find(w => !w.isBusy()) ?? workers[0];
    className = className.replace(".class", "");

    const jarClasses = Object
        .keys(jar.entries)
        .filter(f => f.endsWith(".class"))
        .map(f => f.replace(".class", ""))
        .sort();

    const classData: Record<string, Uint8Array> = {}
    const data = await jar.entries[className + ".class"].bytes();
    classData[className] = data;

    for (const classFile of jarClasses) {
        if (!classFile.startsWith(className + "$")) {
            continue;
        }

        const data = await jar.entries[classFile + ".class"].bytes();
        classData[classFile] = data;
    }

    return await worker.decompileClass(jar.name, jarClasses, className, classData);
}

export async function getClassBytecode(className: string, jar: Jar): Promise<DecompileResult> {
    const worker = workers.find(w => !w.isBusy()) ?? workers[0];
    className = className.replace(".class", "");

    const jarClasses = Object
        .keys(jar.entries)
        .filter(f => f.endsWith(".class"))
        .map(f => f.replace(".class", ""))
        .sort();

    const classData: ArrayBufferLike[] = [];
    const data = await jar.entries[className + ".class"].bytes();
    classData.push(data.buffer);

    for (const classFile of jarClasses) {
        if (!classFile.startsWith(className + "$")) {
            continue;
        }

        const data = await jar.entries[classFile + ".class"].bytes();
        classData.push(data.buffer);
    }

    return await worker.getClassBytecode(jar.name, jarClasses, className, classData);
}
