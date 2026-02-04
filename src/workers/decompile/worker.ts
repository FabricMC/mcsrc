import * as vf from "../../logic/vf";
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Token } from "../../logic/Tokens";
import { getBytecode } from "../JarIndexWorker";
import { type DecompileResult, type DecompileOption, type DecompileData, DecompileJar } from ".";
import { openJar, type Jar } from "../../utils/Jar";

const db = new Dexie("decompiler") as Dexie & {
    options: EntityTable<DecompileOption, "key">,
    results: Table<DecompileResult, [string, string, string]>,
};
db.version(1).stores({
    options: "key, value",
    results: "[owner+className+language], source, tokens",
});

let _options: vf.Options | undefined = undefined;
export const getOptions = async (): Promise<vf.Options> => {
    if (_options) return _options;

    const dbOptions = await db.options.toArray();
    _options = Object.fromEntries(dbOptions.map((it) => [it.key, it.value]));
    return _options;
}

export const setOptions = async (options: vf.Options): Promise<void> => {
    const dbOptions = await db.options.toArray();

    let changed = false;
    const notVisited = new Set(Object.keys(options));
    for (const dbOption of dbOptions) {
        const option = options[dbOption.key];
        if (option != dbOption.value) changed = false;
        if (option) notVisited.delete(dbOption.key);
    }

    if (changed || notVisited.size > 0) {
        await db.results.clear();
    }

    await db.options.clear();
    await db.options.bulkAdd(Object.entries(options).map(([k, v]) => ({ key: k, value: v })));
}

const jars: Record<string, DecompileJar> = {}
export const registerJar = async (jarName: string, blob: Blob | null) => {
    if (blob) {
        jars[jarName] = new DecompileJar(await openJar(jarName, blob))
    } else {
        delete jars[jarName];
    }
}

let lastPromise: Promise<DecompileResult[]> | undefined = undefined
let _promiseCount = 0;
export const promiseCount = () => _promiseCount;

export const decompileManyClasses = async (jarName: string, blob: Blob, classNames: string[], sab: SharedArrayBuffer) => {
    await registerJar(jarName, blob);
    const state = new Uint32Array(sab);

    while (true) {
        const i = Atomics.add(state, 0, 1);
        if (i >= classNames.length) break;

        await decompileClass(jarName, null, [classNames[i]], null);
    }
    await registerJar(jarName, null);
}

export const decompileManyClasses4 = async (jarName: string, blob: Blob, classNames: string[], sab: SharedArrayBuffer, splits: number) => {
    await registerJar(jarName, blob);
    const state = new Uint32Array(sab);

    while (true) {
        const i = Atomics.add(state, 0, splits);
        if (i >= classNames.length) break;

        const targetClassNames: string[] = [];
        for (let j = 0; j < splits; j++) {
            if ((i + j) >= classNames.length) break;
            targetClassNames.push(classNames[i + j]);
        }

        await decompileClass(jarName, null, targetClassNames, null);
    }
    await registerJar(jarName, null);
}

export const decompileClassNoReturn = async (jarName: string, jarClasses: string[] | null, className: string[], classData: DecompileData | null) => {
    await decompileClass(jarName, jarClasses, className, classData);
}

export const decompileClass = async (jarName: string, jarClasses: string[] | null, classNames: string[], classData: DecompileData | null): Promise<DecompileResult[]> => {
    if (!jarClasses) jarClasses = jars[jarName].classes;
    if (!classData) classData = jars[jarName].proxy;

    try {
        _promiseCount++;
        if (lastPromise) await lastPromise;

        const dbResult = await db.results.bulkGet(classNames.map(n => [jarName, n, "java"] as [string, string, string]));
        if (dbResult.every(t => t)) return dbResult as DecompileResult[];

        const options = await getOptions();
        lastPromise = decompileClass0(jarName, jarClasses, classNames, classData, options);
        const promiseResult = await lastPromise;
        await db.results.bulkPut(promiseResult);
        return promiseResult;
    } finally {
        _promiseCount--;
        lastPromise = undefined;
    }
}

async function decompileClass0(jarName: string, jarClasses: string[], classNames: string[], classData: DecompileData, options: vf.Options): Promise<DecompileResult[]> {
    // if (!jarClasses.includes(className)) {
    //     console.error(`Class not found in Minecraft jar: ${className}`);
    //     return { owner: jarName, className, source: `// Class not found: ${className}`, tokens: [], language: "java" };
    // }

    try {
        // decompilerCounter.next(decompilerCounter.value + 1);

        const result = await vf.decompileMany(classNames, {
            source: async (name) => classData[name] ?? null,
            resources: jarClasses,
            options,
            // tokenCollector: tokenCollector(tokens)
        });

        const res: DecompileResult[] = [];
        for (const [className, source] of Object.entries(result)) {
            const tokens: Token[] = [];
            // tokens.push(...generateImportTokens(source));
            // tokens.sort((a, b) => a.start - b.start);

            console.log(`Decompiled class: '${className}'`);
            res.push({ owner: jarName, className, source, tokens, language: "java" });
        }
        return res;
    } // catch (e) {
    //     // console.error(`Error during decompilation of class '${className}':`, e);
    //     // return { owner: jarName, className, source: `// Error during decompilation: ${(e as Error).message}`, tokens: [], language: "java" };
    // }
    finally {
        // decompilerCounter.next(decompilerCounter.value - 1);
    }
}

function tokenCollector(tokens: Token[]): vf.TokenCollector {
    return {
        start: function(content: string): void {
        },
        visitClass: function(start: number, length: number, declaration: boolean, name: string): void {
            tokens.push({ type: "class", start, length, className: name, declaration });
        },
        visitField: function(start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
            tokens.push({ type: "field", start, length, className, declaration, name, descriptor });
        },
        visitMethod: function(start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
            tokens.push({ type: "method", start, length, className, declaration, name, descriptor });
        },
        visitParameter: function(start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
            tokens.push({ type: "parameter", start, length, className, declaration });
        },
        visitLocal: function(start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
            tokens.push({ type: "local", start, length, className, declaration });
        },
        end: function(): void {
        }
    };
}

function generateImportTokens(source: string): Token[] {
    const importTokens: Token[] = [];

    const importRegex = /^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm;

    let match = null;
    while ((match = importRegex.exec(source)) !== null) {
        const importPath = match[1].replaceAll('.', '/');
        if (importPath.endsWith('*')) {
            continue;
        }

        const className = importPath.substring(importPath.lastIndexOf('/') + 1);

        importTokens.push({
            type: "class",
            start: match.index + match[0].lastIndexOf(className),
            length: importPath.length - importPath.lastIndexOf(className),
            className: importPath,
            declaration: false
        });
    }
    return importTokens;
}

export const getClassBytecode = async (jarName: string, jarClasses: string[], className: string, classData: ArrayBufferLike[]): Promise<DecompileResult> => {
    try {
        _promiseCount++;
        let result = await db.results.get([jarName, className, "java"]);
        if (result) return result;

        const promise = lastPromise
            ? lastPromise.then(() => getClassBytecode0(jarName, jarClasses, className, classData))
            : getClassBytecode0(jarName, jarClasses, className, classData);
        lastPromise = promise;

        result = (await promise)[0];
        await db.results.put(result);
        return result;
    } finally {
        _promiseCount--;
    }
}

async function getClassBytecode0(jarName: string, jarClasses: string[], className: string, classData: ArrayBufferLike[]): Promise<DecompileResult[]> {
    if (!jarClasses.includes(className)) {
        console.error(`Class not found in jar: ${className}`);
        return [{ owner: jarName, className, source: `// Class not found: ${className}`, tokens: [], language: "bytecode" }];
    }

    try {
        // decompilerCounter.next(decompilerCounter.value + 1);
        const bytecode = await getBytecode(classData);
        return [{ owner: jarName, className, source: bytecode, tokens: [], language: "bytecode" }];
    } catch (e) {
        console.error(`Error during bytecode retrieval of class '${className}':`, e);
        return [{ owner: jarName, className, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" }];
    } finally {
        // decompilerCounter.next(decompilerCounter.value - 1);
    }
}
