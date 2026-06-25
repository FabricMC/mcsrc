import {
    BehaviorSubject,
    combineLatest, distinctUntilChanged, from, map, Observable, of, shareReplay, switchMap, throttleTime
} from "rxjs";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";
import { selectedFile } from "./State";
import { bytecode, displayLambdas } from "./Settings";
import type { Options } from "./vf";
import type { DecompileResult } from "../workers/decompile/types";
import * as worker from "../workers/decompile/client";
import type { Jar } from "../utils/Jar";
import { classNameFromClassFilePath, type ClassName } from "../utils/Names";

const decompilerCounter = new BehaviorSubject<number>(0);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged()
);

export function getDecompilerOptions(displayLambdas: boolean, remapped: boolean): Options {
    const options: Options = {};

    if (displayLambdas) {
        options["mark-corresponding-synthetics"] = "1";
    }

    if (remapped) {
        options["variable-renaming"] = "tiny";
    }

    return options;
}

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>): Observable<DecompileResult> {
    return combineLatest([
        selectedFile,
        jar,
        bytecode.observable,
        displayLambdas.observable,
    ]).pipe(
        distinctUntilChanged(),
        throttleTime(250),
        switchMap(([file, jar, bytecode, displayLambdas]) => {
            if (!file) {
                return of();
            }

            const className = classNameFromClassFilePath(file);
            if (bytecode) {
                return from(getClassBytecode(className, jar.jar));
            }

            const options = getDecompilerOptions(displayLambdas, jar.metadata.remapped);
            return from(worker.setOptions(options)).pipe(
                switchMap(() => from(decompileClass(className, jar.jar)))
            );
        }),
        shareReplay({ bufferSize: 1, refCount: false })
    );
}

export async function getClassBytecode(className: ClassName, jar: Jar) {
    try {
        decompilerCounter.next(decompilerCounter.value + 1);
        return await worker.getClassBytecode(className, jar);
    } finally {
        decompilerCounter.next(decompilerCounter.value - 1);
    }
}

export async function decompileClass(className: ClassName, jar: Jar) {
    try {
        decompilerCounter.next(decompilerCounter.value + 1);
        return await worker.decompileClass(className, jar);
    } finally {
        decompilerCounter.next(decompilerCounter.value - 1);
    }
}
