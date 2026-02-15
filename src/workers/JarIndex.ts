import { BehaviorSubject, distinctUntilChanged, map, shareReplay } from "rxjs";
import { endpointSymbol } from "vite-plugin-comlink/symbol";
import { minecraftJar, type MinecraftJar } from "../logic/MinecraftApi";
import type { ClassDataString } from "./JarIndexWorker";
import Dexie, { type EntityTable } from "dexie";

export type Class = string;
export type Method = `${string}:${string}:${string}`;
export type Field = `${string}:${string}:${string}`;
// oxlint-disable-next-line typescript/no-redundant-type-constituents
export type ReferenceKey = Class | Method;

export type ReferenceString = `c:${Class}` | `m:${Method}` | `f:${Field}`;

export interface ClassData {
  className: string;
  superName: string;
  accessFlags: number;
  interfaces: string[];
}

export function parseClassData(data: ClassDataString): ClassData {
  const [className, superName, accessFlagsStr, interfacesStr] = data.split("|");
  return {
    className,
    superName,
    accessFlags: parseInt(accessFlagsStr, 10),
    interfaces: interfacesStr ? interfacesStr.split(",").filter((i) => i.length > 0) : [],
  };
}

type JarIndexWorker = typeof import("./JarIndexWorker");

// Percent complete is total >= 0
export const indexProgress = new BehaviorSubject<number>(-1);

let currentJarIndex: JarIndex | null = null;

export const jarIndex = minecraftJar.pipe(
  distinctUntilChanged(),
  map((jar) => {
    // Clean up the previous JarIndex instance
    if (currentJarIndex) {
      currentJarIndex.destroy();
    }

    const newIndex = new JarIndex(jar);
    currentJarIndex = newIndex;
    return newIndex;
  }),
  shareReplay({ bufferSize: 1, refCount: false }),
);

interface JarClassData {
  name: string;
  classes: ClassData[];
}

const db = new Dexie("indexer") as Dexie & {
  classData: EntityTable<JarClassData, "name">;
};
db.version(1).stores({
  classData: "name",
});

// Number of classes to send to each worker in a single batch
const batchSize = 25;

export class JarIndex {
  readonly minecraftJar: MinecraftJar;

  private _workers: ReturnType<typeof createWrorker>[] | undefined;
  private get workers() {
    if (this._workers) return this._workers;
    const threads = navigator.hardwareConcurrency || 4;
    this._workers = Array.from({ length: threads }, () => createWrorker());
    console.log(`Created JarIndex with ${threads} workers`);
    return this._workers;
  }

  private indexPromise: Promise<void> | null = null;
  private classDataCache: ClassData[] | null = null;

  constructor(minecraftJar: MinecraftJar) {
    this.minecraftJar = minecraftJar;
  }

  destroy(): void {
    if (this._workers) {
      for (const worker of this._workers) {
        worker[endpointSymbol].terminate();
      }
      delete this._workers;
    }
    this.classDataCache = null;
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
      await Promise.all(
        this.workers.map((worker) =>
          worker.setWorkerJar(this.minecraftJar.version, this.minecraftJar.blob),
        ),
      );

      const jar = this.minecraftJar.jar;
      const classNames = Object.keys(jar.entries).filter((name) => name.endsWith(".class"));

      let promises: Promise<number>[] = [];

      let taskQueue = [...classNames];
      let completed = 0;

      for (let i = 0; i < this.workers.length; i++) {
        const worker = this.workers[i];

        promises.push(
          (async () => {
            while (true) {
              const batch = taskQueue.splice(0, batchSize);

              if (batch.length === 0) {
                const indexed = await worker.getReferenceSize();
                return indexed;
              }

              await worker.indexBatch(batch);
              completed += batch.length;

              indexProgress.next(Math.round((completed / classNames.length) * 100));
            }
          })(),
        );
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
      await Promise.all(this.workers.map((worker) => worker.setWorkerJar("", null)));
    }
  }

  async getReference(key: ReferenceKey): Promise<ReferenceString[]> {
    await this.indexJar();

    let results: Promise<ReferenceString[]>[] = [];

    for (const worker of this.workers) {
      results.push(worker.getReference(key));
    }

    return Promise.all(results).then((arrays) => arrays.flat());
  }

  async getClassData(): Promise<ClassData[]> {
    if (this.classDataCache) {
      return this.classDataCache;
    }

    const dbResult = await db.classData.get(this.minecraftJar.jar.name);
    if (dbResult) {
      this.classDataCache = dbResult.classes;
      return this.classDataCache;
    }

    try {
      await this.indexJar();

      let results: Promise<ClassDataString[]>[] = [];
      for (const worker of this.workers) {
        results.push(worker.getClassData());
      }

      const classDataStrings = await Promise.all(results).then((arrays) => arrays.flat());
      this.classDataCache = classDataStrings.map(parseClassData);

      await db.classData.put({
        name: this.minecraftJar.jar.name,
        classes: this.classDataCache,
      });

      return this.classDataCache;
    } finally {
      this.destroy();
    }
  }
}

let bytecodeWorker: JarIndexWorker | null = null;

export async function getBytecode(classData: ArrayBufferLike[]): Promise<string> {
  if (!bytecodeWorker) {
    bytecodeWorker = createWrorker();
  }
  return bytecodeWorker.getBytecode(classData);
}

function createWrorker() {
  return new ComlinkWorker<JarIndexWorker>(new URL("./JarIndexWorker", import.meta.url));
}
