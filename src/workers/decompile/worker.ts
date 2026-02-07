import * as vf from "../../logic/vf";
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Token } from "../../logic/Tokens";
import { getBytecode } from "../JarIndexWorker";
import { type DecompileResult, type DecompileOption, type DecompileData, DecompileJar, type DecompileLogger } from "./types";
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

const db = new Dexie("decompiler") as Dexie & {
    options: EntityTable<DecompileOption, "key">,
    results: Table<DecompileResult, [string, string, string]>,
};
db.version(1).stores({
    options: "key, value",
    results: "[owner+className+language], source, tokens",
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
        await db.results.clear();
    }

    await db.options.clear();
    await db.options.bulkAdd(Object.entries(options).map(([k, v]) => ({ key: k, value: v })));
});

const jars: Record<string, DecompileJar> = {};
export const registerJar = (jarName: string, blob: Blob | null) => schedule(async () => {
    if (blob) {
        jars[jarName] = new DecompileJar(await openJar(jarName, blob));
    } else {
        delete jars[jarName];
    }
});

export const loadVFRuntime = (preferWasm: boolean) => schedule(() =>
    vf.loadRuntime(preferWasm));

export const clear = (jarName: string | null) => schedule(async () => {
    if (jarName) {
        await db.results.where("owner").equals(jarName).delete();
    } else {
        await db.results.clear();
    }
});

export async function decompileMany(
    jarName: string,
    blob: Blob,
    classNames: string[],
    sab: SharedArrayBuffer,
    splits: number,
    logger: DecompileLogger | null
): Promise<number> {
    await registerJar(jarName, blob);
    const state = new Uint32Array(sab);

    let count = 0;
    await schedule(async () => {
        while (true) {
            const i = Atomics.add(state, 0, splits);
            if (i >= classNames.length) break;

            const targetClassNames: string[] = [];
            for (let j = 0; j < splits; j++) {
                if ((i + j) >= classNames.length) break;
                targetClassNames.push(classNames[i + j]);
            }

            const result = await _decompile(jarName, null, targetClassNames, null, logger, true);
            count += result.length;
        }
    });

    await registerJar(jarName, null);
    return count;
}

export const decompile = (jarName: string, jarClasses: string[], className: string, classData: DecompileData) => schedule(async () => {
    const result = await _decompile(jarName, jarClasses, [className], classData, null, false);
    return result[0];
});

async function _decompile(
    jarName: string,
    jarClasses: string[] | null,
    classNames: string[],
    classData: DecompileData | null,
    logger: DecompileLogger | null,
    skipDb: boolean,
): Promise<DecompileResult[]> {
    if (!jarClasses) jarClasses = jars[jarName].classes;
    if (!classData) classData = jars[jarName].proxy;

    const dbResult = await db.results.bulkGet(classNames.map(n => [jarName, n, "java"] as [string, string, string]));
    if (dbResult.every(t => t)) return skipDb ? [] : dbResult as DecompileResult[];

    const options = await getOptions();
    const result = await _decompile1(jarName, jarClasses, classNames, classData, options, logger);
    await db.results.bulkPut(result);
    return result;
}

async function _decompile1(
    jarName: string,
    jarClasses: string[],
    classNames: string[],
    classData: DecompileData,
    options: vf.Options,
    logger: DecompileLogger | null,
): Promise<DecompileResult[]> {
    try {
        const allTokens: Record<string, Token[]> = {};
        let currentContent: string | undefined;
        let currentTokens: Token[] | undefined;

        const result = await vf.decompile(classNames, {
            source: async (name) => await classData[name] ?? null,
            resources: jarClasses,
            options,
            logger: {
                writeMessage(level, message, error) {
                    switch (level) {
                        case "warn": console.warn(message); break;
                        case "error": console.error(message, error); break;
                    }
                },
                startClass(className) {
                    if (logger) logger(className);
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
        for (const [className, source] of Object.entries(result)) {
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
            res.push({ owner: jarName, className, source, tokens, language: "java" });
        }
        return res;
    } // catch (e) {
    //     // console.error(`Error during decompilation of class '${className}':`, e);
    //     // return { owner: jarName, className, source: `// Error during decompilation: ${(e as Error).message}`, tokens: [], language: "java" };
    // }
    finally { }
}

export const getClassBytecode = (jarName: string, className: string, classData: ArrayBufferLike[]): Promise<DecompileResult> => schedule(async () => {
    let result = await db.results.get([jarName, className, "bytecode"]);
    if (result) return result;

    try {
        const bytecode = await getBytecode(classData);
        result = { owner: jarName, className, source: bytecode, tokens: [], language: "bytecode" };
    } catch (e) {
        console.error(`Error during bytecode retrieval of class '${className}':`, e);
        result = { owner: jarName, className, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" };
    }

    db.results.put(result);
    return result;
});
