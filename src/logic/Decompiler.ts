/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    BehaviorSubject,
    combineLatest, distinctUntilChanged, from, map, Observable, of, shareReplay, switchMap, tap, throttleTime
} from "rxjs";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";
import { decompile, type Options, type TokenCollector } from "./vf";
import { selectedFile } from "./State";
import type { Jar } from "../utils/Jar";
import type { Token } from "./Tokens";
import { bytecode, displayLambdas } from "./Settings";
import { getBytecode } from "../workers/JarIndex";

export interface DecompileResult {
    className: string;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
}

export const decompiling = new BehaviorSubject<string[]>([]);
export const decompilerCounter = decompiling.pipe(map(classes => classes.length));
export const isDecompiling = decompiling.pipe(map(classes => classes.length > 0));

const DECOMPILER_OPTIONS: Options = {};
const decompilationCache = new Map<string, Promise<DecompileResult>>();

function makeCacheKey(version: string, className: string, option?: "bytecode" | "lambdas"): string {
    let key = `${version}:${className}`;
    if (option === "lambdas") key += ":lambdas";
    if (option === "bytecode") key += ":bytecode";
    return key;
}

export async function getDecompilationResult(
    jar: MinecraftJar, className: string,
    option?: "bytecode" | "lambdas"
): Promise<DecompileResult> {
    const key = makeCacheKey(jar.version, className, option);
    const cached = decompilationCache.get(key);

    if (cached) {
        // Re-insert at end to refresh the cache.
        decompilationCache.delete(key);
        decompilationCache.set(key, cached);
        return await cached;
    }

    try {
        decompiling.next([...decompiling.value, key]);

        if (option === "bytecode") {
            const result = getClassBytecode(className, jar.jar);
            decompilationCache.set(key, result);
            return await result;
        } else {
            let options = { ...DECOMPILER_OPTIONS };
            if (option === "lambdas") {
                options["mark-corresponding-synthetics"] = "1";
            }

            const result = decompileClass(className, jar.jar, options);
            decompilationCache.set(key, result);
            return await result;
        }
    } finally {
        decompiling.next(decompiling.value.filter(it => it !== key));
    }
}

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>): Observable<DecompileResult> {
    return combineLatest([
        selectedFile,
        jar,
        displayLambdas.observable,
        bytecode.observable
    ]).pipe(
        distinctUntilChanged(),
        throttleTime(250),
        switchMap(([className, jar, displayLambdas, bytecode]) =>
            from(getDecompilationResult(jar, className, bytecode ? "bytecode" : displayLambdas ? "lambdas" : undefined))),
        shareReplay({ bufferSize: 1, refCount: false })
    );
}

export const currentSource = currentResult.pipe(
    map(result => result.source)
);

async function decompileClass(className: string, jar: Jar, options: Options): Promise<DecompileResult> {
    console.log(`Decompiling class: '${className}'`);

    const files = Object.keys(jar.entries);

    if (!files.includes(className)) {
        console.error(`Class not found in Minecraft jar: ${className}`);
        return { className, source: `// Class not found: ${className}`, tokens: [], language: "java" };
    }

    try {
        const tokens: Token[] = [];
        const source = await decompile(className.replace(".class", ""), {
            source: async (name: string) => {
                const file = jar.entries[name + ".class"];
                if (file) {
                    const arrayBuffer = await file.bytes();
                    return new Uint8Array(arrayBuffer);
                }

                console.error(`File not found in Minecraft jar: ${name}`);
                return null;
            },
            resources: files.filter(f => f.endsWith('.class')).map(f => f.replace(".class", "")),
            options,
            tokenCollector: tokenCollector(tokens)
        });

        tokens.push(...generateImportTokens(source));
        tokens.sort((a, b) => a.start - b.start);

        return { className, source, tokens, language: "java" };
    } catch (e) {
        console.error(`Error during decompilation of class '${className}':`, e);
        return { className, source: `// Error during decompilation: ${(e as Error).message}`, tokens: [], language: "java" };
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

async function getClassBytecode(className: string, jar: Jar): Promise<DecompileResult> {
    var classData = [];
    const allClasses = Object.keys(jar.entries).filter(f => f.endsWith('.class')).sort();
    const baseClassName = className.replace(".class", "");

    if (!allClasses.includes(className)) {
        console.error(`Class not found in Minecraft jar: ${className}`);
        return { className, source: `// Class not found: ${className}`, tokens: [], language: "bytecode" };
    }

    try {
        const data = await jar.entries[className].bytes();
        classData.push(data.buffer);

        for (const classFile of allClasses) {
            if (!classFile.startsWith(baseClassName + "$")) {
                continue;
            }

            const data = await jar.entries[classFile].bytes();
            classData.push(data.buffer);
        }

        const bytecode = await getBytecode(classData);
        return { className, source: bytecode, tokens: [], language: "bytecode" };
    } catch (e) {
        console.error(`Error during bytecode retrieval of class '${className}':`, e);
        return { className, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" };
    }
}