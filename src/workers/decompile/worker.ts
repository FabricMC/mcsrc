import Dexie, { type EntityTable, type Table } from "dexie";
import { decompile, type Options, type TokenCollector } from "../../logic/vf";
import type { Token } from "../../logic/Tokens";
import { getBytecode } from "../JarIndexWorker";
import type { DecompileResult, DecompileOption, DecompileData } from ".";

const db = new Dexie("decompiler") as Dexie & {
    options: EntityTable<DecompileOption, "key">,
    results: Table<DecompileResult, [string, string, string]>,
};
db.version(1).stores({
    options: "key, value",
    results: "[owner+className+language], source, tokens",
});

let _options: Options | undefined = undefined;
export const getOptions = async (): Promise<Options> => {
    if (_options) return _options;

    const dbOptions = await db.options.toArray();
    _options = Object.fromEntries(dbOptions.map((it) => [it.key, it.value]));
    return _options;
}

export const setOptions = async (options: Options): Promise<void> => {
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

const jars: Record<string, DecompileData> = {}
export const registerJar = (jarName: string, classData: DecompileData | null) => {
    if (classData) {
        jars[jarName] = classData;
    } else {
        delete jars[jarName];
    }
}

let lastPromise: Promise<DecompileResult> | undefined = undefined
let _promiseCount = 0;
export const promiseCount = () => _promiseCount;

export const decompileClassNoReturn = async (jarName: string, jarClasses: string[] | null, className: string, classData: DecompileData | null) => {
    await decompileClass(jarName, jarClasses, className, classData);
}

export const decompileClass = async (jarName: string, jarClasses: string[] | null, className: string, classData: DecompileData | null): Promise<DecompileResult> => {
    if (!jarClasses) jarClasses = Object.keys(jars[jarName]);
    if (!classData) classData = jars[jarName];

    try {
        _promiseCount++;
        let result = await db.results.get([jarName, className, "java"]);
        if (result) return result;

        const options = await getOptions();
        const promise = lastPromise
            ? lastPromise.then(() => decompileClass0(jarName, jarClasses, className, classData, options))
            : decompileClass0(jarName, jarClasses, className, classData, options);
        lastPromise = promise;

        result = await promise;
        await db.results.put(result);
        return result;
    } finally {
        _promiseCount--;
    }
}

async function decompileClass0(jarName: string, jarClasses: string[], className: string, classData: DecompileData, options: Options): Promise<DecompileResult> {
    console.log(`Decompiling class: '${className}'`);

    if (!jarClasses.includes(className)) {
        console.error(`Class not found in Minecraft jar: ${className}`);
        return { owner: jarName, className, source: `// Class not found: ${className}`, tokens: [], language: "java" };
    }

    try {
        // decompilerCounter.next(decompilerCounter.value + 1);

        const tokens: Token[] = [];
        const source = await decompile(className, {
            source: async (name) => classData[name] ?? null,
            resources: jarClasses,
            options,
            tokenCollector: tokenCollector(tokens)
        });

        tokens.push(...generateImportTokens(source));
        tokens.sort((a, b) => a.start - b.start);

        return { owner: jarName, className, source, tokens, language: "java" };
    } catch (e) {
        console.error(`Error during decompilation of class '${className}':`, e);
        return { owner: jarName, className, source: `// Error during decompilation: ${(e as Error).message}`, tokens: [], language: "java" };
    } finally {
        // decompilerCounter.next(decompilerCounter.value - 1);
    }
}

function tokenCollector(tokens: Token[]): TokenCollector {
    return {
        start: function (content: string): void {
        },
        visitClass: function (start: number, length: number, declaration: boolean, name: string): void {
            tokens.push({ type: "class", start, length, className: name, declaration });
        },
        visitField: function (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
            tokens.push({ type: "field", start, length, className, declaration, name, descriptor });
        },
        visitMethod: function (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
            tokens.push({ type: "method", start, length, className, declaration, name, descriptor });
        },
        visitParameter: function (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
            tokens.push({ type: "parameter", start, length, className, declaration });
        },
        visitLocal: function (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
            tokens.push({ type: "local", start, length, className, declaration });
        },
        end: function (): void {
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

        result = await promise;
        await db.results.put(result);
        return result;
    } finally {
        _promiseCount--;
    }
}

async function getClassBytecode0(jarName: string, jarClasses: string[], className: string, classData: ArrayBufferLike[]): Promise<DecompileResult> {
    if (!jarClasses.includes(className)) {
        console.error(`Class not found in jar: ${className}`);
        return { owner: jarName, className, source: `// Class not found: ${className}`, tokens: [], language: "bytecode" };
    }

    try {
        // decompilerCounter.next(decompilerCounter.value + 1);
        const bytecode = await getBytecode(classData);
        return { owner: jarName, className, source: bytecode, tokens: [], language: "bytecode" };
    } catch (e) {
        console.error(`Error during bytecode retrieval of class '${className}':`, e);
        return { owner: jarName, className, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" };
    } finally {
        // decompilerCounter.next(decompilerCounter.value - 1);
    }
}
