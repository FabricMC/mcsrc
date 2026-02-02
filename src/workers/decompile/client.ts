import type { DecompileResult } from ".";
import type { Jar } from "../../utils/Jar";

type DecompileWorker = typeof import("./worker");
function createWrorker() {
    return new ComlinkWorker<DecompileWorker>(
        new URL("./worker", import.meta.url),
    );
}

const threads = navigator.hardwareConcurrency || 4;
const workers = Array.from({ length: threads }, () => createWrorker());

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    await decompileEntireJar(jar);
    return decompileClass0(className, jar);
}

export async function decompileEntireJar(jar: Jar) {
    const entries = await Promise.all(Object
        .entries(jar.entries)
        .filter(([f, _]) => f.endsWith(".class"))
        .map(([f, e]) => e.bytes().then(b => [f.replace(".class", ""), b] as [string, Uint8Array])));
    const entryLength = entries.length;

    const data = Object.fromEntries(entries);
    await Promise.all(workers.map(w => w.registerJar(jar.name, data)));

    entries.reverse();
    async function decompile(worker: ReturnType<typeof createWrorker>) {
        if (entries.length === 0) return;

        const [className, _] = entries.pop()!;
        await worker
            .decompileClassNoReturn(jar.name, null, className, null)
            .then(async () => await decompile(worker));
    }

    const start = performance.now();
    await Promise.all(workers.map(w => decompile(w)));
    const elapsedMs = performance.now() - start;
    console.log(`Decompiled ${entryLength} classes in ${elapsedMs.toFixed(3)} ms`);

    await Promise.all(workers.map(w => w.registerJar(jar.name, null)));
}

export async function decompileClass0(className: string, jar: Jar): Promise<DecompileResult> {
    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
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
    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
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
