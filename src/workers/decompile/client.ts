import * as Comlink from "comlink";
import type * as vf from "../../logic/vf";
import { DecompileJar, type DecompileData, type DecompileResult } from "./types";
import type { Jar } from "../../utils/Jar";

type DecompileWorker = typeof import("./worker");
function createWrorker() {
    return new ComlinkWorker<DecompileWorker>(
        new URL("./worker", import.meta.url),
        { name: "decompileWorker" }
    );
}
type WorkerInstance = ReturnType<typeof createWrorker>;

const MAX_THREADS = navigator.hardwareConcurrency || 4;
let workers: WorkerInstance[] = [];
let preferWasmRuntime = true;

async function ensureWorkers(count: number) {
    count = Math.min(count, MAX_THREADS);
    if (workers.length >= count) return;

    let newWorkers = Array.from(
        { length: count - workers.length },
        () => createWrorker());

    await Promise.all(newWorkers.map(w => w.loadVFRuntime(preferWasmRuntime)));
    workers.push(...newWorkers);
}

async function findWorker(): Promise<WorkerInstance> {
    let i = 0;
    if (workers.length > 0) {
        const count = await Promise.all(workers.map(w => w.promiseCount()));
        i = workers.reduce((a, _, b) => count[a] < count[b] ? a : b, 0);
        if (count[i] === 0) return workers[i];
    }

    if (workers.length < (MAX_THREADS - 1)) {
        i = workers.length;
        await ensureWorkers(workers.length + 1);
    }

    return workers[i];
}

export async function setRuntime(preferWasm: boolean) {
    preferWasmRuntime = preferWasm;
    await Promise.all(workers.map(w => w.scheduleClose()));
    workers = [];
}

export async function setOptions(options: vf.Options) {
    const sab = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
    const state = new Uint32Array(sab);
    state[0] = 0;

    await Promise.all(workers.map(w => w.setOptions(options, sab)));
}

export async function deleteCache(): Promise<number> {
    const worker = await findWorker();
    return await worker.clear();
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

    const dJar = new DecompileJar(jar);
    return {
        async start() {
            try {
                const optThreads = Math.min(options?.threads ?? MAX_THREADS, MAX_THREADS);
                const optSplits = options?.splits ?? 100;
                const optLogger = options?.logger ? Comlink.proxy(options.logger) : null;

                await ensureWorkers(optThreads);
                const classNames = dJar.classes.filter(n => !n.includes("$"));
                const result = await Promise.all((workers
                    .slice(0, optThreads))
                    .map(w => w.decompileMany(jar.name, jar.blob, classNames, sab, optSplits, optLogger)));
                const total = result.reduce((acc, n) => acc + n, 0);
                return total;
            } finally {
                // kill all workers
                setRuntime(preferWasmRuntime);
            }
        },
        stop() {
            Atomics.store(state, 0, dJar.classes.length);
        },
    };
}

export async function decompileClass(className: string, jar: Jar): Promise<DecompileResult> {
    className = className.replace(".class", "");
    const entry = jar.entries[`${className}.class`];

    if (!entry) return {
        className,
        checksum: 0,
        source: `// Class not found: ${className}`,
        tokens: [],
        language: "java",
    };

    const jarClasses = new DecompileJar(jar).classes;
    const classData: DecompileData = {};
    classData[className] = {
        checksum: entry.crc32,
        data: await entry.bytes(),
    };

    for (const classFile of jarClasses) {
        if (!classFile.startsWith(`${className}\$`)) {
            continue;
        }

        const entry = jar.entries[`${classFile}.class`];
        classData[classFile] = {
            checksum: entry.crc32,
            data: await entry.bytes(),
        };
    }

    const worker = await findWorker();
    return await worker.decompile(jarClasses, className, classData);
}

export async function getClassBytecode(className: string, jar: Jar): Promise<DecompileResult> {
    className = className.replace(".class", "");
    const entry = jar.entries[`${className}.class`];

    if (!entry) return {
        className,
        checksum: 0,
        source: `// Class not found: ${className}`,
        tokens: [],
        language: "bytecode",
    };

    const classData: ArrayBufferLike[] = [];
    const data = await entry.bytes();
    classData.push(data.buffer);

    const jarClasses = new DecompileJar(jar).classes;
    for (const classFile of jarClasses) {
        if (!classFile.startsWith(`${className}\$`)) {
            continue;
        }

        const data = await jar.entries[`${classFile}.class`].bytes();
        classData.push(data.buffer);
    }

    const worker = await findWorker();
    return await worker.getClassBytecode(className, entry.crc32, classData);
}
