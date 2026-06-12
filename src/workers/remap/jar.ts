import * as Comlink from "comlink";

import type { Entry, Zip } from "@katana-project/zip";
import type { Jar, JarEntry } from "../../utils/Jar";

import type { JarIndexer } from "../jar-index/types";

export async function createRemappedJarView(name: string, blob: Blob, mappingsBlob: Blob, zip: Zip): Promise<Jar> {
    const worker = createWrorker().c;
    const entries: { [key: string]: JarEntry; } = {};
    await worker.loadMappings(mappingsBlob);
    const obfToDeobfMap = await worker.getObfToDeobf();

    zip.entries.forEach(entry => {
        if (entry.name.endsWith(".class")) {
            const classPath = entry.name.replace(/\.class$/, "");
            let deobfName = obfToDeobfMap.get(classPath);
            if (!deobfName) {
                console.warn("Cannot remap class " + classPath);
                entries[entry.name] = entry;
            } else {
                entries[deobfName + ".class"] = createRemappedEntry(worker, entry);
            }
        } else {
            entries[entry.name] = entry;
        }
    });

    return {
        name: name,
        blob: blob,
        mappingsBlob: mappingsBlob,
        entries: entries
    };
}

function createRemappedEntry(worker: Comlink.Remote<JarIndexer>, entry: Entry): JarEntry {
    return {
        name: entry.name,
        // TODO: these are technically wrong since they are from the unremapped entry
        crc32: entry.crc32,
        uncompressedSize: entry.uncompressedSize,
        bytes: (() => {
            // TODO: how will this scale if a worker tries to decompile the whole jar?
            let cachedPromise: Promise<Uint8Array<ArrayBuffer>> | undefined;
            return async (): Promise<Uint8Array<ArrayBuffer>> => {
                if (!cachedPromise) {
                    cachedPromise = entry.bytes().then(async (obfBytes) => {
                        const remappedBlob = await worker.remapEntry(new Blob([obfBytes as Uint8Array<ArrayBuffer>]));
                        return remappedBlob.bytes();
                    });
                }
                return cachedPromise;
            };
        })()
    };
}

function createWrorker() {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module", name: "jar-remapper" });
    return {
        c: Comlink.wrap<JarIndexer>(worker),
        w: worker,
    };
}