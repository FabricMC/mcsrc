import * as vf from "../../logic/vineflower/vineflower";
import * as Comlink from "comlink";
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Token } from "../../logic/Tokens";
import { type DecompileResult, type DecompileOption, type DecompileData, DecompileJar } from "./types";
import { openJar } from "../../utils/Jar";
import { JarIndexer } from "../jar-index/types";
import { DEFAULT_VERSION, type Version } from "../../logic/vineflower/versions";
import { classNameFromDottedClassName, toClassName, type ClassName } from "../../utils/Names";

export class DecompileWorker {
    #lastPromise: Promise<unknown> | undefined = undefined;
    #promiseCount = 0;
    #preferWasmRuntime = true;
    #version: Version;
    promiseCount = () => this.#promiseCount;

    async schedule<T>(fn: () => Promise<T>): Promise<T> {
        try {
            this.#promiseCount++;
            if (this.#lastPromise) await this.#lastPromise;
            this.#lastPromise = fn();
            return await this.#lastPromise as Promise<T>;
        } finally {
            this.#promiseCount--;
            this.#lastPromise = undefined;
        }
    }

    scheduleClose = () => this.schedule(async () => close());

    db = new Dexie("decompiler") as Dexie & {
        options: EntityTable<DecompileOption, "key">,
        results6: Table<DecompileResult, [string, number, string, string, Version]>,
    };

    constructor(version: Version = DEFAULT_VERSION) {
        this.#version = version;
        this.db.version(7).stores({
            options: "key",
            results6: "[className+checksum+language+jarName+version]",
            // clear old data
            results5: null,
            results4: null,
            results3: null,
            results2: null,
            results: null,
        });
    }

    #options: vf.Options | undefined = undefined;
    async getOptions(): Promise<vf.Options> {
        if (this.#options) return this.#options;

        const dbOptions = await this.db.options.toArray();
        this.#options = Object.fromEntries(dbOptions.map((it) => [it.key, it.value]));
        return this.#options;
    }

    setOptions = (options: vf.Options, sab: SharedArrayBuffer) => this.schedule(async () => {
        this.#options = undefined;

        // Only set the DB on one worker, should be propagated everywhere else.
        const state = new Uint32Array(sab);
        if (Atomics.add(state, 0, 1) >= 1) return;

        const dbOptions = await this.db.options.toArray();

        let changed = false;
        const notVisited = new Set(Object.keys(options));
        for (const dbOption of dbOptions) {
            const option = options[dbOption.key];
            if (option !== dbOption.value) changed = true;
            if (option) notVisited.delete(dbOption.key);
        }

        if (changed || notVisited.size > 0) {
            await this.db.results6.clear();
        }

        await this.db.options.clear();
        await this.db.options.bulkAdd(Object.entries(options).map(([k, v]) => ({ key: k, value: v })));
    });

    loadVFRuntime = (preferWasm: boolean, version: Version) => this.schedule(() => {
        this.#preferWasmRuntime = preferWasm;
        this.#version = version;
        return vf.loadRuntime(preferWasm, this.#version);
    });

    clear = (): Promise<number> => this.schedule(async () => {
        const count = await this.db.results6.count();
        await this.db.results6.clear();
        return count;
    });

    decompileMany = (
        jarName: string,
        jarBlob: Blob,
        classNames: ClassName[],
        sab: SharedArrayBuffer,
        splits: number,
        logger?: (index: number) => Promise<void> | void,
    ): Promise<number> => this.schedule(async () => {
        const state = new Uint32Array(sab);
        const jar = new DecompileJar(await openJar(jarName, jarBlob));

        let logPromises: Promise<void>[] = [];
        let nameLogger;
        if (logger) {
            const class2index = new Map(classNames.map((v, i) => [v, i] as [ClassName, number]));
            nameLogger = (className: ClassName) => {
                if (!class2index) return;
                const i = class2index.get(className);
                if (i) logPromises.push(Promise.resolve(logger!(i)));
            };
        }

        let count = 0;
        while (true) {
            const i = Atomics.add(state, 0, splits);
            if (i >= classNames.length) break;

            const targetClassNames: ClassName[] = [];
            for (let j = 0; j < splits; j++) {
                if ((i + j) >= classNames.length) break;

                const className = classNames[i + j];
                const checksum = jar.proxy[className]?.checksum;
                if (!checksum) continue;

                const dbCount = await this.db.results6
                    .where("[className+checksum+language+jarName+version]")
                    .equals([className, checksum, "java", jarName, this.#version])
                    .count();

                if (dbCount >= 1) {
                    nameLogger?.(className);
                } else {
                    targetClassNames.push(className);
                }
            }

            try {
                const result = await this.#decompile(jarName, jar.classes, targetClassNames, jar.proxy, nameLogger);
                count += result.length;
            } catch (e) {
                console.error("Error during decompilation:", e);
            }

            await Promise.all(logPromises);
            logPromises = [];
        }

        return count;
    });

    decompile = (
        className: ClassName,
        jarName: string,
        jarBlob: Blob,
    ): Promise<DecompileResult> => this.schedule(async () => {
        try {
            const jar = new DecompileJar(await openJar(jarName, jarBlob));
            const checksum = jar.proxy[className]?.checksum;
            const dbResult = await this.db.results6.get([className, checksum, "java", jarName, this.#version]);
            if (dbResult) return dbResult;

            const result = await this.#decompile(jarName, jar.classes, [className], jar.proxy);
            return result[0];
        } catch (e) {
            console.error(`Error during decompilation of class '${className}':`, e);
            return {
                className,
                checksum: 0,
                jarName,
                source: `// Error during decompilation: ${(e as Error).message}`,
                tokens: [],
                language: "java",
                version: this.#version
            };
        }
    });

    async #decompile(
        jarName: string,
        jarClasses: ClassName[],
        classNames: ClassName[],
        classData: DecompileData,
        logger?: (className: ClassName) => void,
    ): Promise<DecompileResult[]> {
        await vf.loadRuntime(this.#preferWasmRuntime, this.#version);

        const allTokens: Record<string, Token[]> = {};
        let currentContent: string | undefined;
        let currentTokens: Token[] | undefined;
        let currentClassName: ClassName | undefined;

        const sources = await vf.decompile(this.#version, classNames, {
            source: async (name) => {
                const className = toClassName(name);
                const data = await classData[className]?.data;

                if (!data) {
                    if (name.startsWith("net/minecraft/")) {
                        console.warn(`Class data not found for '${name}'`);
                    }

                    return null;
                }

                return data;
            },
            resources: jarClasses,
            options: await this.getOptions(),
            logger: {
                writeMessage(level, message, error) {
                    switch (level) {
                        case "warn": console.warn(message); break;
                        case "error": console.error(message, error); break;
                    }
                },
                startClass(className) {
                    currentClassName = toClassName(className);
                },
                endClass() {
                    if (logger && currentClassName) logger(currentClassName);
                    currentClassName = undefined;
                },
            },
            tokenCollector: {
                start(content) {
                    currentContent = content;
                    currentTokens = [];
                },
                visitClass(start, length, declaration, name) {
                    currentTokens!.push({ type: "class", start, length, className: toClassName(name), declaration });
                },
                visitField(start, length, declaration, className, name, descriptor) {
                    currentTokens!.push({ type: "field", start, length, className: toClassName(className), declaration, name, descriptor });
                },
                visitMethod(start, length, declaration, className, name, descriptor) {
                    currentTokens!.push({ type: "method", start, length, className: toClassName(className), declaration, name, descriptor });
                },
                visitParameter(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                    currentTokens!.push({ type: "parameter", start, length, className: toClassName(className), declaration });
                },
                visitLocal(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                    currentTokens!.push({ type: "local", start, length, className: toClassName(className), declaration });
                },
                end() {
                    allTokens[currentContent!] = currentTokens!;
                    currentContent = undefined;
                    currentTokens = undefined;
                }
            },
        });

        const res: DecompileResult[] = [];
        for (const [rawClassName, source] of Object.entries(sources)) {
            const className = toClassName(rawClassName);
            const checksum = classData[className]?.checksum ?? 0;
            const sourceStr = source as string;
            const tokens = allTokens[sourceStr] ?? [];

            const importRegex = /^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm;
            let match: RegExpExecArray | null = null;
            while ((match = importRegex.exec(sourceStr)) !== null) {
                const importPath = classNameFromDottedClassName(match[1]);
                if (importPath.endsWith('*')) {
                    continue;
                }

                const simpleClassName = importPath.substring(importPath.lastIndexOf('/') + 1);

                tokens.push({
                    type: "class",
                    start: match.index + match[0].lastIndexOf(simpleClassName),
                    length: importPath.length - importPath.lastIndexOf(simpleClassName),
                    className: importPath,
                    declaration: false
                });
            }

            tokens.sort((a, b) => a.start - b.start);
            res.push({ className, checksum, jarName, source: sourceStr, tokens, language: "java", version: this.#version });
        }

        await this.db.results6.bulkPut(res);
        return res;
    }

    #indexer = new JarIndexer();
    getClassBytecode = (className: ClassName, checksum: number, jarName: string, classData: ArrayBufferLike[]): Promise<DecompileResult> => this.schedule(async () => {
        let result = await this.db.results6.get([className, checksum, "bytecode", jarName, this.#version]);
        if (result) return result;

        try {
            const bytecode = await this.#indexer.getBytecode(classData);
            result = { className, checksum, jarName, source: bytecode, tokens: [], language: "bytecode", version: this.#version };
        } catch (e) {
            console.error(`Error during bytecode retrieval of class '${className}':`, e);
            result = { className, checksum, jarName, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode", version: this.#version };
        }

        await this.db.results6.put(result);
        return result;
    });
}
Comlink.expose(new DecompileWorker());
