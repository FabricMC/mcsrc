/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    BehaviorSubject,
    combineLatest, distinctUntilChanged, from, map, Observable, shareReplay, switchMap, tap, throttleTime
} from "rxjs";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";
import { decompile, type Options, type TokenCollector } from "./vf";
import { selectedFile } from "./State";
import { removeImports } from "./Settings";
import type { Jar } from "../utils/Jar";

export interface DecompileResult {
    className: string;
    source: string;
    classTokens: ClassToken[];
}

export interface ClassToken {
    // The number of characters from the start of the source
    start: number;
    // The length of the token in characters
    length: number;
    // The name of the class this token represents
    className: string;
    declaration: boolean;
}

const decompilerCounter = new BehaviorSubject<number>(0);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
);

const decompilerOptions: Observable<Options> = removeImports.observable.pipe(
    map(removeImports => (
        { "remove-imports": removeImports ? "1" : "0" }
    ))
);

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>): Observable<DecompileResult> {
    return combineLatest([
        selectedFile,
        jar,
        decompilerOptions
    ]).pipe(
        distinctUntilChanged(),
        tap(() => decompilerCounter.next(decompilerCounter.value + 1)),
        throttleTime(250),
        switchMap(([className, jar, options]) => from(decompileClass(className, jar.jar, options))),
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
        return { className, source: `// Class not found: ${className}`, classTokens: [] };
    }

    try {
        const classTokens: ClassToken[] = [];
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
            tokenCollector: tokenCollector(classTokens)
        });

        classTokens.sort((a, b) => a.start - b.start);

        return { className, source, classTokens };
    } catch (e) {
        console.error(`Error during decompilation of class '${className}':`, e);
        return { className, source: `// Error during decompilation: ${(e as Error).message}`, classTokens: [] };
    }
}

function tokenCollector(classTokens: ClassToken[]): TokenCollector {
    return {
        start: function (content: string): void {
        },
        visitClass: function (start: number, length: number, declaration: boolean, name: string): void {
            classTokens.push({ start, length, className: name, declaration });
        },
        visitField: function (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
        },
        visitMethod: function (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string): void {
        },
        visitParameter: function (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
        },
        visitLocal: function (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string): void {
        },
        end: function (): void {
        }
    };
}