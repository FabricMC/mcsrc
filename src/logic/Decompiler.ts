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
import { displayLambdas } from "./Settings";

export interface DecompileResult {
    className: string;
    source: string;
    tokens: Token[];
}

const decompilerCounter = new BehaviorSubject<number>(0);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged()
);

const DECOMPILER_OPTIONS: Options = {};

const decompilationCache = new Map<string, DecompileResult>();

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>): Observable<DecompileResult> {
    return combineLatest([
        selectedFile,
        jar,
        displayLambdas.observable,
    ]).pipe(
        distinctUntilChanged(),
        tap(() => decompilerCounter.next(decompilerCounter.value + 1)),
        throttleTime(250),
        switchMap(([className, jar, displayLambdas]) => {
            let key = `${jar.version}:${className}`;

            if (displayLambdas) {
                key += ":lambdas";
            }

            const cached = decompilationCache.get(key);
            if (cached) {
                // Re-insert at end
                decompilationCache.delete(key);
                decompilationCache.set(key, cached);
                return of(cached);
            }

            let options = { ...DECOMPILER_OPTIONS };

            if (displayLambdas) {
                options["mark-corresponding-synthetics"] = "1";
            }

            return from(decompileClass(className, jar.jar, options)).pipe(
                tap(result => {
                    // Store DecompilationResult in in-memory cache
                    if (decompilationCache.size >= 75) {
                        const firstKey = decompilationCache.keys().next().value;
                        if (firstKey) decompilationCache.delete(firstKey);
                    }
                    decompilationCache.set(key, result);
                })
            );
        }),
        tap(() => decompilerCounter.next(decompilerCounter.value - 1)),
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
        return { className, source: `// Class not found: ${className}`, tokens: [] };
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

        return { className, source, tokens };
    } catch (e) {
        console.error(`Error during decompilation of class '${className}':`, e);
        return { className, source: `// Error during decompilation: ${(e as Error).message}`, tokens: [] };
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
