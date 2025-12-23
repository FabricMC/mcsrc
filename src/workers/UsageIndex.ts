import { BehaviorSubject, distinctUntilChanged, map, shareReplay } from "rxjs";
import { minecraftJar, type MinecraftJar } from "../logic/MinecraftApi";

export type Class = string;
export type Method = `${string}:${string}:${string}`;
export type Field = `${string}:${string}:${string}`;
export type UsageKey = Class | Method | Field;

export type UsageString =
    | `c:${Class}`
    | `m:${Method}`
    | `f:${Field}`;

type UsageIndexWorker = typeof import("./UsageIndexWorker");

// Percent complete is total >= 0
export const indexProgress = new BehaviorSubject<number>(-1);

export const usageIndex = minecraftJar.pipe(
    distinctUntilChanged(),
    map(jar => new UsageIndex(jar)),
    shareReplay({ bufferSize: 1, refCount: false })
);

export class UsageIndex {
    readonly minecraftJar: MinecraftJar;
    readonly workers: ReturnType<typeof createWrorker>[];

    private indexPromise: Promise<void> | null = null;

    constructor(minecraftJar: MinecraftJar) {
        this.minecraftJar = minecraftJar;

        const threads = navigator.hardwareConcurrency || 4;
        this.workers = Array.from({ length: threads }, () => createWrorker());

        console.log(`Created UsageIndex with ${threads} workers`);
    }

    async indexJar(): Promise<void> {
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

            const jar = this.minecraftJar.jar;
            const classNames = Object.keys(jar.entries)
                .filter(name => name.endsWith(".class"));

            let promises: Promise<number>[] = [];

            let taskQueue = [...classNames];
            let completed = 0;

            for (let i = 0; i < this.workers.length; i++) {
                const worker = this.workers[i];

                promises.push(new Promise(async (resolve) => {
                    while (true) {
                        const nextTask = taskQueue.pop();

                        if (!nextTask) {
                            const indexed = worker.getUsageSize();
                            resolve(indexed);
                            return;
                        }

                        indexProgress.next(Math.round((++completed / classNames.length) * 100));

                        const entry = jar.entries[nextTask];
                        const data = await entry.bytes();

                        await worker.index(data.buffer);
                    }
                }));
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
        }
    }

    async getUsage(key: UsageKey): Promise<UsageString[]> {
        await this.indexJar();

        let results: Promise<UsageString[]>[] = [];

        for (const worker of this.workers) {
            results.push(worker.getUsage(key));
        }

        return Promise.all(results).then(arrays => arrays.flat());
    }
}


function createWrorker() {
    return new ComlinkWorker<UsageIndexWorker>(
        new URL("./UsageIndexWorker", import.meta.url),
        {
        }
    );
}
