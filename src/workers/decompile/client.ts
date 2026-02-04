import { DecompileJar, type DecompileResult } from ".";
import type { Jar } from "../../utils/Jar";

type DecompileWorker = typeof import("./worker");
function createWrorker() {
    return new ComlinkWorker<DecompileWorker>(
        new URL("./worker", import.meta.url),
        { name: "decompileWorker" }
    );
}

const threads = (navigator.hardwareConcurrency / 2) || 1;
const workers = Array.from({ length: threads }, () => createWrorker());

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    // await decompileEntireJar(jar);
    await decompileEntireJar4(jar);
    return decompileClass0(className, jar);
}

export async function decompileEntireJar(jar: Jar) {
    const classNames = new DecompileJar(jar).classes
        .filter(n => !n.includes("$"))
        .slice(0, 500);

    const sab = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const view = new Uint32Array(sab);
    view[0] = 0;

    const start = performance.now();
    await Promise.all(workers.map(w => w.decompileManyClasses(jar.name, jar.blob, classNames, sab)));
    const elapsed = (performance.now() - start) / 1000;
    console.log(`Decompiled ${classNames.length} classes in ${elapsed.toFixed(3)} s`);
}

export async function decompileEntireJar4(jar: Jar) {
    const classNames = new DecompileJar(jar).classes
        .filter(n => !n.includes("$"))
        // .slice(0, 500);

    const sab = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const view = new Uint32Array(sab);
    view[0] = 0;

    const start = performance.now();
    await Promise.all(workers.map(w => w.decompileManyClasses4(jar.name, jar.blob, classNames, sab, 100)));
    const elapsed = (performance.now() - start) / 1000;
    console.log(`Decompiled ${classNames.length} classes in ${elapsed.toFixed(3)} s`);
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

    const res = await worker.decompileClass(jar.name, jarClasses, [className], classData);
    return res[0];
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
