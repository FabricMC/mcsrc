import * as vf from "../../logic/vineflower/vineflower";
import * as Comlink from "comlink";
import Dexie, { type EntityTable, type Table } from "dexie";
import type { Token } from "../../logic/Tokens";
import { type DecompileResult, type DecompileOption, type DecompileData, DecompileJar } from "./types";
import { openJar } from "../../utils/Jar";
import { JarIndexer } from "../jar-index/types";
import { DEFAULT_VERSION, type Version } from "../../logic/vineflower/versions";

export class DecompileWorker {
    #lastPromise: Promise<unknown> | undefined = undefined;
    #promiseCount = 0;
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
        results3: Table<DecompileResult, [string, number, string]>,
    };

    constructor(version: Version = DEFAULT_VERSION) {
        this.#version = version;
        this.db.version(4).stores({
            options: "key",
            results3: "[className+checksum+language]",
            // clear old data
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
            await this.db.results3.clear();
        }

        await this.db.options.clear();
        await this.db.options.bulkAdd(Object.entries(options).map(([k, v]) => ({ key: k, value: v })));
    });

    loadVFRuntime = (preferWasm: boolean, version: Version) => this.schedule(() => {
        this.#version = version;
        return vf.loadRuntime(preferWasm, this.#version);
    });

    clear = (): Promise<number> => this.schedule(async () => {
        const count = await this.db.results3.count();
        await this.db.results3.clear();
        return count;
    });

    decompileMany = (
        jarName: string,
        jarBlob: Blob,
        classNames: string[],
        sab: SharedArrayBuffer,
        splits: number,
        logger?: (index: number) => Promise<void> | void,
    ): Promise<number> => this.schedule(async () => {
        const state = new Uint32Array(sab);
        const jar = new DecompileJar(await openJar(jarName, jarBlob));

        let logPromises: Promise<void>[] = [];
        let nameLogger;
        if (logger) {
            const class2index = new Map(classNames.map((v, i) => [v, i] as [string, number]));
            nameLogger = (className: string) => {
                if (!class2index) return;
                const i = class2index.get(className);
                if (i) logPromises.push(Promise.resolve(logger!(i)));
            };
        }

        let count = 0;
        while (true) {
            const i = Atomics.add(state, 0, splits);
            if (i >= classNames.length) break;

            const targetClassNames: string[] = [];
            for (let j = 0; j < splits; j++) {
                if ((i + j) >= classNames.length) break;

                const className = classNames[i + j];
                const checksum = jar.proxy[className]?.checksum;
                if (!checksum) continue;

                const dbCount = await this.db.results3
                    .where("[className+checksum+language]")
                    .equals([className, checksum, "java"])
                    .count();

                if (dbCount >= 1) {
                    nameLogger?.(className);
                } else {
                    targetClassNames.push(className);
                }
            }

            try {
                const result = await this.#decompile(jar.classes, targetClassNames, jar.proxy, nameLogger);
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
        className: string,
        jarName: string,
        jarBlob: Blob,
    ): Promise<DecompileResult> => this.schedule(async () => {
        try {
            const jar = new DecompileJar(await openJar(jarName, jarBlob));
            const checksum = jar.proxy[className]?.checksum;
            const dbResult = await this.db.results3.get([className, checksum, "java"]);
            if (dbResult) return dbResult;

            const result = await this.#decompile(jar.classes, [className], jar.proxy);
            return result[0];
        } catch (e) {
            console.error(`Error during decompilation of class '${className}':`, e);
            return {
                className,
                checksum: 0,
                source: `// Error during decompilation: ${(e as Error).message}`,
                tokens: [],
                language: "java"
            };
        }
    });

    async #decompile(
        jarClasses: string[],
        classNames: string[],
        classData: DecompileData,
        logger?: (className: string) => void,
    ): Promise<DecompileResult[]> {
        const allTokens: Record<string, Token[]> = {};
        let currentContent: string | undefined;
        let currentTokens: Token[] | undefined;
        let currentClassName: string | undefined;

        const sources = await vf.decompile(this.#version, classNames, {
            source: async (name) => {
                const data = await classData[name]?.data;

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
                    currentClassName = className;
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
                    currentTokens!.push({ type: "class", start, length, className: name, declaration });
                },
                visitField(start, length, declaration, className, name, descriptor) {
                    currentTokens!.push({ type: "field", start, length, className, declaration, name, descriptor });
                },
                visitMethod(start, length, declaration, className, name, descriptor) {
                    currentTokens!.push({ type: "method", start, length, className, declaration, name, descriptor });
                },
                visitParameter(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                    currentTokens!.push({ type: "parameter", start, length, className, declaration });
                },
                visitLocal(start, length, declaration, className, _methodName, _methodDescriptor, _index, _name) {
                    currentTokens!.push({ type: "local", start, length, className, declaration });
                },
                end() {
                    allTokens[currentContent!] = currentTokens!;
                    currentContent = undefined;
                    currentTokens = undefined;
                }
            },
        });

        const res: DecompileResult[] = [];
        for (const [className, source] of Object.entries(sources)) {
            const checksum = classData[className]?.checksum ?? 0;
            const tokens = allTokens[source] ?? [];

            const importRegex = /^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm;
            let match = null;
            while ((match = importRegex.exec(source)) !== null) {
                const importPath = match[1].replaceAll('.', '/');
                if (importPath.endsWith('*')) {
                    continue;
                }

                const className = importPath.substring(importPath.lastIndexOf('/') + 1);

                tokens.push({
                    type: "class",
                    start: match.index + match[0].lastIndexOf(className),
                    length: importPath.length - importPath.lastIndexOf(className),
                    className: importPath,
                    declaration: false
                });
            }

            tokens.sort((a, b) => a.start - b.start);
            res.push({ className, checksum, source, tokens, language: "java" });
        }

        await this.db.results3.bulkPut(res);
        return res;
    }

    #indexer = new JarIndexer();
    getClassBytecode = (className: string, checksum: number, classData: ArrayBufferLike[]): Promise<DecompileResult> => this.schedule(async () => {
        let result = await this.db.results3.get([className, checksum, "bytecode"]);
        if (result) return result;

        try {
            const bytecode = await this.#indexer.getBytecode(classData);
            result = { className, checksum, source: bytecode, tokens: [], language: "bytecode" };
        } catch (e) {
            console.error(`Error during bytecode retrieval of class '${className}':`, e);
            result = { className, checksum, source: `// Error during bytecode retrieval: ${(e as Error).message}`, tokens: [], language: "bytecode" };
        }

        await this.db.results3.put(result);
        return result;
    });
}
Comlink.expose(new DecompileWorker());
