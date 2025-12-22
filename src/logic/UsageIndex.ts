import { BehaviorSubject, map } from 'rxjs';
import type { MinecraftJar } from './MinecraftApi';
import { indexJar } from '../workers/UsageIndex';

// Percent complete is total >= 0
export const indexProgress = new BehaviorSubject<number>(-1);
export const isIndexing = indexProgress.pipe(
    map(progress => progress >= 0)
);

let isRunning = false;

export async function refreshIndex(minecraftJar: MinecraftJar): Promise<void> {
    if (isRunning) {
        throw new Error("Indexing is already in progress");
    }

    isRunning = true;

    try {
        await indexJar(minecraftJar, indexProgress);
    } finally {
        isRunning = false;
        indexProgress.next(-1);
    }
}