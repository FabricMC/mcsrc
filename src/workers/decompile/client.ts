import * as Comlink from "comlink";
import { DecompileJar, type DecompileResult } from "./types";
import type { Jar } from "../../utils/Jar";

type DecompileWorker = typeof import("./worker");
function createWrorker() {
    return new ComlinkWorker<DecompileWorker>(
        new URL("./worker", import.meta.url),
        { name: "decompileWorker" }
    );
}

const threads = navigator.hardwareConcurrency || 4;
const workers = Array.from({ length: threads }, () => createWrorker());

export type DecompileEntireJarOptions = {
    threads?: number,
    splits?: number,
    logger?: (className: string) => void,
};

export type DecompileEntireJarTask = {
    start: () => Promise<void>,
    stop: () => void;
};

export async function deleteCache(jarName: string | null) {
    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
    await worker.clearDb(jarName);
}

export function decompileEntireJar(jar: Jar, options?: DecompileEntireJarOptions): DecompileEntireJarTask {
    const sab = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const state = new Uint32Array(sab);
    state[0] = 0;

    const optThreads = Math.min(options?.threads ?? threads, threads);
    const optSplits = options?.splits ?? 100;
    const optLogger = options?.logger ? Comlink.proxy(options.logger) : undefined;

    const classNames = new DecompileJar(jar).classes
        .filter(n => !n.includes("$"));

    return {
        async start() {
            console.log("optThreads " + optThreads);
            console.log("optSplits " + optSplits);

            const start = performance.now();
            const result = await Promise.all(workers
                .slice(0, optThreads)
                .map(w => w.decompileManyClasses(jar.name, jar.blob, classNames, sab, optSplits, optLogger)));
            const total = result.reduce((acc, n) => acc + n, 0);
            const elapsed = (performance.now() - start) / 1000;
            console.log(`Decompiled ${total} classes in ${elapsed.toFixed(3)} s`);
        },
        stop() {
            Atomics.store(state, 0, classNames.length);
        },
    };
}

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
    className = className.replace(".class", "");

    const jarClasses = Object
        .keys(jar.entries)
        .filter(f => f.endsWith(".class"))
        .map(f => f.replace(".class", ""))
        .sort();

    const classData: Record<string, Uint8Array> = {};
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
