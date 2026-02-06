import * as Comlink from "comlink";
import { DecompileJar, type DecompileData, type DecompileResult } from "./types";
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

export async function deleteCache(jarName: string | null) {
    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
    await worker.clear(jarName);
}

export type DecompileEntireJarOptions = {
    threads?: number,
    splits?: number,
    logger?: (className: string) => void,
};

export type DecompileEntireJarTask = {
    start: () => Promise<number>,
    stop: () => void;
};

export function decompileEntireJar(jar: Jar, options?: DecompileEntireJarOptions): DecompileEntireJarTask {
    const sab = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const state = new Uint32Array(sab);
    state[0] = 0;

    const optThreads = Math.min(options?.threads ?? threads, threads);
    const optSplits = options?.splits ?? 100;
    const optLogger = options?.logger ? Comlink.proxy(options.logger) : null;

    const classNames = new DecompileJar(jar).classes
        .filter(n => !n.includes("$"));

    return {
        async start() {
            const result = await Promise.all(workers
                .slice(0, optThreads)
                .map(w => w.decompileMany(jar.name, jar.blob, classNames, sab, optSplits, optLogger)));
            const total = result.reduce((acc, n) => acc + n, 0);
            return total;
        },
        stop() {
            Atomics.store(state, 0, classNames.length);
        },
    };
}

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    className = className.replace(".class", "");

    if (!jar.entries[`${className}.class`]) return {
        owner: jar.name,
        className,
        source: `// Class not found: ${className}`,
        tokens: [],
        language: "java",
    };

    const jarClasses = new DecompileJar(jar).classes;
    const classData: DecompileData = {};
    const data = await jar.entries[`${className}.class`].bytes();
    classData[className] = data;

    for (const classFile of jarClasses) {
        if (!classFile.startsWith(`${className}\$`)) {
            continue;
        }

        const data = await jar.entries[`${classFile}.class`].bytes();
        classData[classFile] = data;
    }

    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
    return await worker.decompile(jar.name, jarClasses, className, classData);
}

export async function getClassBytecode(className: string, jar: Jar): Promise<DecompileResult> {
    className = className.replace(".class", "");

    if (!jar.entries[`${className}.class`]) return {
        owner: jar.name,
        className,
        source: `// Class not found: ${className}`,
        tokens: [],
        language: "bytecode",
    };

    const jarClasses = new DecompileJar(jar).classes;
    const classData: ArrayBufferLike[] = [];
    const data = await jar.entries[`${className}.class`].bytes();
    classData.push(data.buffer);

    for (const classFile of jarClasses) {
        if (!classFile.startsWith(`${className}\$`)) {
            continue;
        }

        const data = await jar.entries[`${classFile}.class`].bytes();
        classData.push(data.buffer);
    }

    const worker = workers.reduce((a, b) => a.promiseCount() < b.promiseCount() ? a : b);
    return await worker.getClassBytecode(jar.name, jarClasses, className, classData);
}
