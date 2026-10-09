import * as Comlink from "comlink";
import { BehaviorSubject, distinctUntilChanged, map, shareReplay } from "rxjs";
import { minecraftJar, type MinecraftJar } from "../../logic/MinecraftApi";
import type {ClassDataString, JarIndexer, MemberData, ReferenceKey, ReferenceString} from "./types";
import Dexie, { type EntityTable } from "dexie";
import { isClassFilePath, toClassName, type ClassFilePath, type ClassName } from "../../utils/Names";


export interface ClassData {
    className: ClassName;
    superName: ClassName | "";
    accessFlags: number;
    interfaces: ClassName[];
}

export function parseClassData(data: ClassDataString): ClassData {
    const [className, superName, accessFlagsStr, interfacesStr] = data.split("|");
    return {
        className: toClassName(className),
        superName: superName ? toClassName(superName) : "",
        accessFlags: parseInt(accessFlagsStr, 10),
        interfaces: interfacesStr ? interfacesStr.split(",").filter(i => i.length > 0).map(toClassName) : []
    };
}

// Percent complete is total >= 0
export const indexProgress = new BehaviorSubject<number>(-1);

let currentJarIndex: JarIndex | null = null;

export const jarIndex = minecraftJar.pipe(
    distinctUntilChanged(),
    map(jar => {
        // Clean up the previous JarIndex instance
        if (currentJarIndex) {
            currentJarIndex.destroy();
        }

        const newIndex = new JarIndex(jar);
        currentJarIndex = newIndex;
        return newIndex;
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);

interface JarClassData {
    name: string,
    classes: ClassData[],
}

const db = new Dexie("indexer") as Dexie & {
    classData: EntityTable<JarClassData, "name">;
};
db.version(1).stores({
    classData: "name"
});

// Number of classes to send to each worker in a single batch
const batchSize = 25;

export class JarIndex {
    readonly minecraftJar: MinecraftJar;

    private _workers: ReturnType<typeof createWrorker>[] | undefined;
    private get workers() {
        if (this._workers) return this._workers;
        const threads = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
        this._workers = Array.from({ length: threads }, () => createWrorker());
        console.log(`Created JarIndex with ${threads} workers`);
        return this._workers;
    }

    private indexPromise: Promise<void> | null = null;
    private memberDataPromise: Promise<MemberData[]> | null = null;
    private classDataPromise: Promise<ClassData[]> | null = null;

    constructor(minecraftJar: MinecraftJar) {
        this.minecraftJar = minecraftJar;
    }

    destroy(): void {
        if (this._workers) {
            for (const worker of this._workers) {
                worker.w.terminate();
            }
            delete this._workers;
        }
        this.memberDataPromise = null;
        this.classDataPromise = null;
        this.indexPromise = null;
    }

    private async indexJar(): Promise<void> {
        if (!this.indexPromise) {
            this.indexPromise = this.performIndexing();
        }
        return this.indexPromise;
    }

    private async performIndexing(): Promise<void> {
        try {
            const startTime = performance.now();

            indexProgress.next(0);
            console.log(`Indexing minecraft jar using ${this.workers.length} workers`);

            // Initialize all workers in parallel
            await Promise.all(this.workers.map(worker => worker.c.setJar(this.minecraftJar.version, this.minecraftJar.blob)));

            const jar = this.minecraftJar.jar;
            const classNames = Object.keys(jar.entries)
                .filter(isClassFilePath);

            let promises: Promise<number>[] = [];

            let taskQueue: ClassFilePath[] = [...classNames];
            let completed = 0;

            for (let i = 0; i < this.workers.length; i++) {
                const worker = this.workers[i];

                promises.push((async () => {
                    while (true) {
                        const batch = taskQueue.splice(0, batchSize);

                        if (batch.length === 0) {
                            const indexed = await worker.c.getReferenceSize();
                            return indexed;
                        }

                        await worker.c.indexBatch(batch);
                        completed += batch.length;

                        indexProgress.next(Math.round((completed / classNames.length) * 100));
                    }
                })());
            }

            const indexedCounts = await Promise.all(promises);
            const totalIndexed = indexedCounts.reduce((sum, count) => sum + count, 0);

            const endTime = performance.now();
            const duration = ((endTime - startTime) / 1000).toFixed(2);
            console.log(`Indexing completed in ${duration} seconds. Total indexed: ${totalIndexed}`);
            indexProgress.next(-1);
        } catch (error) {
            // Reset promise on error so indexing can be retried
            this.indexPromise = null;
            throw error;
        } finally {
            await Promise.all(this.workers.map(worker => worker.c.setJar("", null)));
        }
    }

    async getReference(key: ReferenceKey): Promise<ReferenceString[]> {
        await this.indexJar();

        let results: Promise<ReferenceString[]>[] = [];

        for (const worker of this.workers) {
            results.push(worker.c.getReference(key));
        }

        return Promise.all(results).then(arrays => arrays.flat());
    }

    getMemberData(): Promise<MemberData[]> {
        if (!this.memberDataPromise) {
            this.memberDataPromise = this.loadMemberData().catch(error => {
                this.memberDataPromise = null;
                throw error;
            });
        }
        return this.memberDataPromise;
    }

    private async loadMemberData(): Promise<MemberData[]> {
        await this.indexJar();
        return (await Promise.all(this.workers.map(worker => worker.c.getMemberData()))).flat();
    }

    getClassData(): Promise<ClassData[]> {
        if (!this.classDataPromise) {
            this.classDataPromise = this.loadClassData().catch(error => {
                this.classDataPromise = null;
                throw error;
            });
        }
        return this.classDataPromise;
    }

    private async loadClassData(): Promise<ClassData[]> {
        const dbResult = await db.classData.get(this.minecraftJar.jar.name);
        if (dbResult) return dbResult.classes;

        await this.indexJar();
        const raw = (await Promise.all(this.workers.map(worker => worker.c.getClassData()))).flat();
        const classes = raw.map(parseClassData);
        await db.classData.put({ name: this.minecraftJar.jar.name, classes });
        return classes;
    }

}

let bytecodeWorker: ReturnType<typeof createWrorker> | null = null;

export async function getBytecode(classData: ArrayBufferLike[]): Promise<string> {
    if (!bytecodeWorker) {
        bytecodeWorker = createWrorker();
    }

    return bytecodeWorker.c.getBytecode(classData);
}

function createWrorker() {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "jar-indexer" });
    return {
        c: Comlink.wrap<JarIndexer>(worker),
        w: worker,
    };
}
