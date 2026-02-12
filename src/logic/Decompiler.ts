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
import * as worker from "../workers/decompile/client";
import type { Jar } from "../utils/Jar";

const decompilerCounter = new BehaviorSubject<number>(0);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged()
);

const decompilerOptions = combineLatest([
    displayLambdas.observable
]).pipe(
    distinctUntilChanged(),
    switchMap(([displayLambdas]) => {
        const options: Options = {};

        if (displayLambdas) {
            options["mark-corresponding-synthetics"] = "1";
        }

        return of(options);
    }),
);
decompilerOptions.subscribe(v => worker.setOptions(v));

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>): Observable<DecompileResult> {
    return combineLatest([
        selectedFile,
        jar,
        bytecode.observable,
        decompilerOptions,
    ]).pipe(
        distinctUntilChanged(),
        throttleTime(250),
        switchMap(([className, jar, bytecode]) => {
            if (bytecode) {
                return from(getClassBytecode(className, jar.jar));
            }

            return from(decompileClass(className, jar.jar));
        }),
        shareReplay({ bufferSize: 1, refCount: false })
    );
}

export async function getClassBytecode(className: string, jar: Jar) {
    try {
        decompilerCounter.next(decompilerCounter.value + 1);
        return await worker.getClassBytecode(className, jar);
    } finally {
        decompilerCounter.next(decompilerCounter.value - 1);
    }
}

export async function decompileClass(className: string, jar: Jar) {
    try {
        decompilerCounter.next(decompilerCounter.value + 1);
        return await worker.decompileClass(className, jar);
    } finally {
        decompilerCounter.next(decompilerCounter.value - 1);
    }
}
