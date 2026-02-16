import * as vf from "../../logic/vf";
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Token } from "../../logic/Tokens";
import { getBytecode } from "../JarIndexWorker";
import { type DecompileResult, type DecompileOption, type DecompileData, DecompileJar } from "./types";
import { openJar } from "../../utils/Jar";

let lastPromise: Promise<unknown> | undefined = undefined;
let _promiseCount = 0;
export const promiseCount = () => _promiseCount;

async function schedule<T>(fn: () => Promise<T>): Promise<T> {
    try {
        _promiseCount++;
        if (lastPromise) await lastPromise;
        lastPromise = fn();
        return await lastPromise as Promise<T>;
    } finally {
        _promiseCount--;
        lastPromise = undefined;
    }
}

export const scheduleClose = () => schedule(async () => close());

const db = new Dexie("decompiler") as Dexie & {
    options: EntityTable<DecompileOption, "key">,
    results2: Table<DecompileResult, [string, number, string]>,
};
db.version(3).stores({
    options: "key",
    results2: "[className+checksum+language]",
    // clear old data
    results: null,
});

let _options: vf.Options | undefined = undefined;
export async function getOptions(): Promise<vf.Options> {
    if (_options) return _options;

    const dbOptions = await db.options.toArray();
    _options = Object.fromEntries(dbOptions.map((it) => [it.key, it.value]));
    return _options;
}

export const setOptions = (options: vf.Options, sab: SharedArrayBuffer) => schedule(async () => {
    _options = undefined;

    // Only set the DB on one worker, should be propagated everywhere else.
    const state = new Uint32Array(sab);
    if (Atomics.add(state, 0, 1) >= 1) return;

    const dbOptions = await db.options.toArray();

    let changed = false;
    const notVisited = new Set(Object.keys(options));
    for (const dbOption of dbOptions) {
        const option = options[dbOption.key];
        if (option !== dbOption.value) changed = true;
        if (option) notVisited.delete(dbOption.key);
    }

    if (changed || notVisited.size > 0) {
        await db.results2.clear();
    }

    await db.options.clear();
    await db.options.bulkAdd(Object.entries(options).map(([k, v]) => ({ key: k, value: v })));
});

export const loadVFRuntime = (preferWasm: boolean) => schedule(() =>
    vf.loadRuntime(preferWasm));

export const clear = (): Promise<number> => schedule(async () => {
    const count = await db.results2.count();
    await db.results2.clear();
    return count;
});

export const decompileMany = (
    jarName: string,
    jarBlob: Blob,
    classNames: string[],
    sab: SharedArrayBuffer,
    splits: number,
    logger?: (index: number) => Promise<void> | void,
): Promise<number> => schedule(async () => {
    const state = new Uint32Array(sab);
    const jar = new DecompileJar(await openJar(jarName, jarBlob));

    let logPromises: Promise<void>[] = [];
    let nameLogger;
    if (logger) {
        const class2index = new Map(classNames.map((v, i) => [v, i] as [string, number]));
        nameLogger = (className: string) => {
            if (!class2index) return;
            const i = class2index.get(className);
            if (i) logPromises.push(Promise.resolve(logger!(i)));
        };
    }

    let count = 0;
    while (true) {
        const i = Atomics.add(state, 0, splits);
        if (i >= classNames.length) break;

        const targetClassNames: string[] = [];
        for (let j = 0; j < splits; j++) {
            if ((i + j) >= classNames.length) break;

            const className = classNames[i + j];
            const checksum = jar.proxy[className]?.checksum;
            if (!checksum) continue;

            const dbCount = await db.results2
                .where("[className+checksum+language]")
                .equals([className, checksum, "java"])
                .count();

            if (dbCount >= 1) {
                nameLogger?.(className);
            } else {
                targetClassNames.push(className);
            }
        }

        try {
            const result = await _decompile(jar.classes, targetClassNames, jar.proxy, nameLogger);
            count += result.length;
        } catch (e) {
            console.error("Error during decompilation:", e);
        }

        await Promise.all(logPromises);
        logPromises = [];
    }

    return count;
});

export const decompile = (
    className: string,
    jarName: string,
    jarBlob: Blob,
): Promise<DecompileResult> => schedule(async () => {
    try {
        const jar = new DecompileJar(await openJar(jarName, jarBlob));
        const checksum = jar.proxy[className]?.checksum;
        const dbResult = await db.results2.get([className, checksum, "java"]);
        if (dbResult) return dbResult;

        const result = await _decompile(jar.classes, [className], jar.proxy);
        return result[0];
    } catch (e) {
        console.error(`Error during decompilation of class '${className}':`, e);
        return {
            className,
            checksum: 0,
            source: `// Error during decompilation: ${(e as Error).message}`,
            tokens: [],
            language: "java"
        };
    }
});

async function _decompile(
    jarClasses: string[],
    classNames: string[],
    classData: DecompileData,
    logger?: (className: string) => void,
): Promise<DecompileResult[]> {
    const allTokens: Record<string, Token[]> = {};
    let currentContent: string | undefined;
    let currentTokens: Token[] | undefined;
    let currentClassName: string | undefined;

    const sources = await vf.decompile(classNames, {
        source: async (name) => {
            const data = await classData[name]?.data;

            if (!data) {
                if (name.startsWith("net/minecraft/")) {
                    console.warn(`Class data not found for '${name}'`);
                }

                return null;
            }

            return data;
        },
        resources: jarClasses,
        options: await getOptions(),
        logger: {
            writeMessage(level, message, error) {
                switch (level) {
                    case "warn": console.warn(message); break;
                    case "error": console.error(message, error); break;
                }
            },
            startClass(className) {
                currentClassName = className;
            },
            endClass() {
                if (logger && currentClassName) logger(currentClassName);
                currentClassName = undefined;
            },
        },
        tokenCollector: {
            start(content) {
                currentContent = content;
                currentTokens = [];
            },
            visitClass(start, length, declaration, name) {
                currentTokens!.push({ type: "class", start, length, className: name, declaration });
            },
            visitField(start, length, declaration, className, name, descriptor) {
                currentTokens!.push({ type: "field", start, length, className, declaration, name, descriptor });
            },
            visitMethod(start, length, declaration, className, name, descriptor) {
                currentTokens!.push({ type: "method", start, length, className, declaration, name, descriptor });
            },
            visitParameter(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                currentTokens!.push({ type: "parameter", start, length, className, declaration });
            },
            visitLocal(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                currentTokens!.push({ type: "local", start, length, className, declaration });
            },
            end() {
                allTokens[currentContent!] = currentTokens!;
                currentContent = undefined;
                currentTokens = undefined;
            }
        },
    });

    const res: DecompileResult[] = [];
    for (const [className, source] of Object.entries(sources)) {
        const checksum = classData[className]?.checksum ?? 0;
        const tokens = allTokens[source] ?? [];

        const importRegex = /^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm;
        let match = null;
        while ((match = importRegex.exec(source)) !== null) {
            const importPath = match[1].replaceAll('.', '/');
            if (importPath.endsWith('*')) {
                continue;
            }

            const className = importPath.substring(importPath.lastIndexOf('/') + 1);

            tokens.push({
                type: "class",
                start: match.index + match[0].lastIndexOf(className),
                length: importPath.length - importPath.lastIndexOf(className),
                className: importPath,
                declaration: false
            });
        }

        tokens.sort((a, b) => a.start - b.start);
        res.push({ className, checksum, source, tokens, language: "java" });
    }

    await db.results2.bulkPut(res);
    return res;
}

export const getClassBytecode = (className: string, checksum: number, classData: ArrayBufferLike[]): Promise<DecompileResult> => schedule(async () => {
    let result = await db.results2.get([className, checksum, "bytecode"]);
    if (result) return result;

    try {
        const bytecode = await getBytecode(classData);
        result = { className, checksum, source: bytecode, tokens: [], language: "bytecode" };
    } catch (e) {
        console.error(`Error during bytecode retrieval of class '${className}':`, e);
        result = { className, checksum, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" };
    }

    await db.results2.put(result);
    return result;
});
