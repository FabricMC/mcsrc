import * as Comlink from "comlink";
import { openJar } from "../../utils/Jar";
import { classNameFromClassFilePath, isClassFilePath, toClassFilePath } from "../../utils/Names";
import { writeZip } from "./zip";
import type { RemapClassJob, RemapWorker, RemapWorkerResult } from "./worker";

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
        const results = workerResults.flat().sort((a, b) => a.name.localeCompare(b.name));
        const blob = writeZip(results);
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`Remapped ${results.length} classes for ${version} in ${duration} seconds`);
        onProgress?.(100);
        return blob;
    } finally {
        for (const worker of workers) {
            worker.w.terminate();
        }
    }
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

export type { RemapWorkerResult };
