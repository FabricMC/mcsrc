/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    BehaviorSubject,
    combineLatest, distinctUntilChanged, from, map, Observable, of, shareReplay, switchMap, tap, throttleTime
} from "rxjs";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";
import { selectedFile } from "./State";
import { bytecode, displayLambdas } from "./Settings";
import type { Options } from "./vf";
import type { DecompileResult } from "../workers/decompile/types";
import { decompileClass, getClassBytecode } from "../workers/decompile/client";

const decompilerCounter = new BehaviorSubject<number>(0);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged()
);

export const DECOMPILER_OPTIONS: Options = {};

const decompilationCache = new Map<string, DecompileResult>();

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
        switchMap(([className, jar, displayLambdas, bytecode]) => {
            if (bytecode) {
                return from(getClassBytecode(className, jar.jar));
            }

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

            return from(decompileClass(className, jar.jar)).pipe(
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
        shareReplay({ bufferSize: 1, refCount: false })
    );
}

export const currentSource = currentResult.pipe(
    map(result => result.source)
);
