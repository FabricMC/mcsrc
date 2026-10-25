import {
    BehaviorSubject,
    combineLatest, distinctUntilChanged, from, map, Observable, of, shareReplay, switchMap
} from "rxjs";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";
import { openTabs, selectedFile, selectedMinecraftVersion, vineflowerVersion } from "./State";
import { bytecode, displayLambdas } from "./Settings";
import type { Options } from "./vineflower/vineflower";
import type { DecompileResult } from "../workers/decompile/types";
import * as worker from "../workers/decompile/client";
import type { Jar } from "../utils/Jar";
import { classNameFromClassFilePath, type ClassName } from "../utils/Names";
import { CodeTab } from "./tabs/CodeTab";
import { DEFAULT_VERSION, type Version } from "./vineflower/versions";

const decompilerCounter = new BehaviorSubject<number>(0);

function clearOpenTabSourceCaches(): void {
    for (const tab of openTabs.value) {
        if (tab instanceof CodeTab) {
            tab.clearSourceCache();
        }
    }
}

function clearCacheWhenChanged<T>(setting: Observable<T>): void {
    setting.pipe(distinctUntilChanged()).subscribe(clearOpenTabSourceCaches);
}

clearCacheWhenChanged(bytecode.observable);
clearCacheWhenChanged(displayLambdas.observable);
clearCacheWhenChanged(selectedMinecraftVersion);

export const isDecompiling = decompilerCounter.pipe(
    map(count => count > 0),
    distinctUntilChanged()
);

export function getDecompilerOptions(displayLambdas: boolean): Options {
    const options: Options = {};

    if (displayLambdas) {
        options["mark-corresponding-synthetics"] = "1";
    }

    return options;
}

export const currentResult = decompileResultPipeline(minecraftJar);
export function decompileResultPipeline(jar: Observable<MinecraftJar>, refCount = false): Observable<DecompileResult> {
    const cacheOpenTabs = jar === minecraftJar;

    return combineLatest([
        selectedFile,
        jar,
        bytecode.observable,
        displayLambdas.observable,
    ]).pipe(
        distinctUntilChanged((previous, current) =>
            previous[0] === current[0] &&
            previous[1] === current[1] &&
            previous[2] === current[2] &&
            previous[3] === current[3]
        ),
        switchMap(([file, jar, bytecode, displayLambdas]) => {
            if (!file) {
                return of();
            }

            const className = classNameFromClassFilePath(file);
            const tab = openTabs.value.find(tab => tab.key === file);
            const codeTab = cacheOpenTabs && tab instanceof CodeTab ? tab : undefined;
            const cachedResult = codeTab?.getCachedResult() ?? null;
            if (cachedResult) {
                return of(cachedResult);
            }

            if (bytecode) {
                return from(getClassBytecode(className, jar.jar)).pipe(
                    map(result => cacheTabResult(codeTab, result))
                );
            }

            const options = getDecompilerOptions(displayLambdas);
            return from(worker.setOptions(options)).pipe(
                switchMap(() => from(decompileClass(className, jar.jar))),
                map(result => cacheTabResult(codeTab, result))
            );
        }),
        shareReplay({ bufferSize: 1, refCount })
    );
}

function cacheTabResult(tab: CodeTab | undefined, result: DecompileResult): DecompileResult {
    if (tab && vineflowerVersion.value === DEFAULT_VERSION) {
        tab.cacheResult(result);
    }
    return result;
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
        return await worker.decompileClass(className, jar, vineflowerVersion.value);
    } finally {
        decompilerCounter.next(decompilerCounter.value - 1);
    }
}
