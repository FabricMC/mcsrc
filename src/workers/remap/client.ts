import * as Comlink from "comlink";
import { openJar } from "../../utils/Jar";
import { classNameFromClassFilePath, isClassFilePath, toClassFilePath } from "../../utils/Names";
import { writeZip } from "./zip";
import type { RemapClassJob, RemapWorker, RemapWorkerResult, RemapWorkerStats } from "./worker";

const batchSize = 8;

function createWorker() {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "jar-remapper" });
    return {
        c: Comlink.wrap<RemapWorker>(worker),
        w: worker,
    };
}

export async function remapMinecraftJar(
    version: string,
    jarBlob: Blob,
    mappingsBlob: Blob,
    onProgress?: (percent: number) => void,
): Promise<Blob> {
    const startTime = performance.now();
    const threads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    const workers = Array.from({ length: threads }, () => createWorker());

    try {
        const jar = await openJar(version, jarBlob);
        const obfToDeobf = await workers[0].c.getObfToDeobf(mappingsBlob);
        const jobs = createRemapJobs(Object.keys(jar.entries), obfToDeobf);

        if (jobs.length === 0) {
            return writeZip([]);
        }

        let completed = 0;
        onProgress?.(0);

        const logger = onProgress ? Comlink.proxy((count: number) => {
            completed += count;
            onProgress(Math.round((completed / jobs.length) * 100));
        }) : undefined;

        const stateBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT);
        const state = new Uint32Array(stateBuffer);
        state[0] = 0;

        const workerResults = await Promise.all(workers.map(worker =>
            worker.c.remapClasses(version, jarBlob, mappingsBlob, jobs, stateBuffer, batchSize, logger)
        ));

        const timings = mergeStats(workerResults.map(result => result.stats));
        const results = workerResults.flatMap(result => result.entries).sort((a, b) => a.name.localeCompare(b.name));
        const zipStartTime = performance.now();
        const blob = writeZip(results);
        const zipMs = performance.now() - zipStartTime;
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`Remapped ${results.length} classes for ${version} in ${duration} seconds`);
        console.log(
            `[remap:${version}] workers=${threads} classes=${timings.classes} ` +
            `loadMappings=${formatMs(timings.loadMappingsMs)} openJar=${formatMs(timings.openJarMs)} ` +
            `read=${formatMs(timings.readMs)} remap=${formatMs(timings.remapMs)} crc=${formatMs(timings.crcMs)} ` +
            `compress=${formatMs(timings.compressMs)} zip=${formatMs(zipMs)} ` +
            `stored=${timings.storedClasses} deflated=${timings.compressedClasses} ` +
            `input=${formatBytes(timings.uncompressedBytes)} output=${formatBytes(timings.outputBytes)}`
        );
        onProgress?.(100);
        return blob;
    } finally {
        await cleanupWorkers(workers);
    }
}

async function cleanupWorkers(workers: ReturnType<typeof createWorker>[]): Promise<void> {
    await Promise.allSettled(workers.map(async worker => {
        try {
            await worker.c.dispose();
        } catch (error) {
            console.warn("Failed to dispose remap worker cleanly", error);
        } finally {
            worker.c[Comlink.releaseProxy]();
            worker.w.terminate();
        }
    }));
}

function createRemapJobs(paths: string[], obfToDeobf: Map<string, string>): RemapClassJob[] {
    const jobs: RemapClassJob[] = [];
    const seenTargets = new Set<string>();

    for (const path of paths) {
        if (!isClassFilePath(path)) continue;

        const className = classNameFromClassFilePath(path);
        const mappedClassName = obfToDeobf.get(className) ?? className;
        const targetPath = toClassFilePath(mappedClassName);

        if (seenTargets.has(targetPath)) {
            console.warn(`Skipping duplicate remapped class target: ${targetPath}`);
            continue;
        }

        seenTargets.add(targetPath);
        jobs.push({ sourcePath: path, targetPath });
    }

    return jobs;
}

function mergeStats(stats: RemapWorkerStats[]): RemapWorkerStats {
    return stats.reduce<RemapWorkerStats>((total, stat) => ({
        classes: total.classes + stat.classes,
        loadMappingsMs: total.loadMappingsMs + stat.loadMappingsMs,
        openJarMs: total.openJarMs + stat.openJarMs,
        readMs: total.readMs + stat.readMs,
        remapMs: total.remapMs + stat.remapMs,
        crcMs: total.crcMs + stat.crcMs,
        compressMs: total.compressMs + stat.compressMs,
        compressedClasses: total.compressedClasses + stat.compressedClasses,
        storedClasses: total.storedClasses + stat.storedClasses,
        uncompressedBytes: total.uncompressedBytes + stat.uncompressedBytes,
        outputBytes: total.outputBytes + stat.outputBytes,
    }), {
        classes: 0,
        loadMappingsMs: 0,
        openJarMs: 0,
        readMs: 0,
        remapMs: 0,
        crcMs: 0,
        compressMs: 0,
        compressedClasses: 0,
        storedClasses: 0,
        uncompressedBytes: 0,
        outputBytes: 0,
    });
}

function formatMs(ms: number): string {
    return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)}KiB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)}MiB`;
}

export type { RemapWorkerResult };
