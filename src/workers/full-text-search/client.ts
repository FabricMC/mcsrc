import * as Comlink from "comlink";
import { minecraftJar, type MinecraftJar } from "../../logic/MinecraftApi";
import { distinctUntilChanged, mergeMap, shareReplay } from "rxjs";
import type { FullTextSearchOptions, FullTextSearchResult, FullTextSearchWorker } from "./worker";
import { onDecompiledSources } from "../decompile/client";

let currentInstance: FullTextSearch | undefined;
export const fullTextSearch = minecraftJar.pipe(
    distinctUntilChanged(),
    mergeMap(async jar => {
        if (currentInstance) {
            await currentInstance.destroy();
        }

        const newInstance = new FullTextSearch(jar);
        currentInstance = newInstance;
        return newInstance;
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);

export class FullTextSearch {
    readonly #jar: MinecraftJar;
    constructor(jar: MinecraftJar) {
        this.#jar = jar;
    }

    #_worker?: Comlink.Remote<FullTextSearchWorker>;
    async #worker(): Promise<Comlink.Remote<FullTextSearchWorker>> {
        if (this.#_worker) return this.#_worker;

        const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "full-text-search" });
        this.#_worker = Comlink.wrap<FullTextSearchWorker>(worker);
        await this.#_worker.init(this.#jar.jar.name);

        console.log("Indexing decompiled sources...");
        const startTime = performance.now();
        await onDecompiledSources(this.#jar.jar, async (className, source) => {
            // console.log("fts", className);
            this.#_worker!.index(className, source);
        });
        const elapsedMs = performance.now() - startTime;
        console.log(`Finished in ${elapsedMs.toFixed(3)} ms`);

        return this.#_worker;
    };

    async destroy() {
        await this.#_worker?.destroy();
    }

    async find(query: string, options?: FullTextSearchOptions): Promise<FullTextSearchResult[]> {
        const worker = await this.#worker();
        return await worker.find(query, options);
    }
}
