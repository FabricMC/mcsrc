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

export const DECOMPILER_OPTIONS: Options = {};

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

            let options = { ...DECOMPILER_OPTIONS };

            if (displayLambdas) {
                options["mark-corresponding-synthetics"] = "1";
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
