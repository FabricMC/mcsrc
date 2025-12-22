import type { BehaviorSubject } from "rxjs";
import type { MinecraftJar } from "../logic/MinecraftApi";

type UsageIndexWorker = typeof import("./UsageIndexWorker");

export async function indexJar(minecraftJar: MinecraftJar, progress: BehaviorSubject<number>): Promise<void> {
    const threads = navigator.hardwareConcurrency || 4;
    const workers = Array.from({ length: threads }, () => createWrorker());

    console.log(`Indexing minecraft jar using ${threads} threads`);

    const jar = minecraftJar.jar;
    const classNames = Object.keys(jar.entries)
        .filter(name => name.endsWith(".class"));

    let promises: Promise<void>[] = [];

    let taskQueue = [...classNames];
    let completed = 0;

    for (let i = 0; i < workers.length; i++) {
        const worker = workers[i];

        promises.push(new Promise(async (resolve) => {
            while (true) {
                // Get the next task
                const nextTask = taskQueue.pop();

                if (!nextTask) {
                    // No more work left to do
                    resolve();
                    return;
                }

                const entry = jar.entries[nextTask];
                const data = await entry.bytes();

                await worker.index(data.buffer, minecraftJar.version);

                // percentage progress
                progress.next(Math.round((++completed / classNames.length) * 100));
            }
        }));
    }

    await Promise.all(promises);
}

function createWrorker() {
    return new ComlinkWorker<UsageIndexWorker>(
        new URL("./UsageIndexWorker", import.meta.url),
        {
        }
    );
}
