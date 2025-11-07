import { BehaviorSubject, from, ReplaySubject, switchMap } from "rxjs";
import JSZip from 'jszip';
import { agreedEula } from "./Settings";

const CACHE_NAME = 'mcsrc-v1';
const MINECRAFT_JAR_URL = "https://piston-data.mojang.com/v1/objects/26551033b7b935436f3407b85d14cac835e65640/client.jar";

export const minecraftVersions = new BehaviorSubject<string[]>(["25w45a"]);
export const downloadProgress = new BehaviorSubject<number | undefined>(undefined);
export const minecraftJarBlob = new ReplaySubject<Blob>(1);
export const minecraftJar = minecraftJarBlob.pipe(
    switchMap(blob => from(JSZip.loadAsync(blob)))
);

async function cachedFetch(url: string): Promise<Response> {
    if (!('caches' in window)) {
        return fetch(url);
    }

    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
        return cachedResponse
    };

    const response = await fetch(url);
    if (response.ok) {
        cache.put(url, response.clone());
    }
    return response;
}

export async function downloadMinecraftJar(): Promise<Blob> {
    const response = await cachedFetch(MINECRAFT_JAR_URL);
    if (!response.ok) {
        throw new Error(`Failed to download Minecraft jar: ${response.statusText}`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || total === 0) {
        const blob = await response.blob();
        minecraftJarBlob.next(blob);
        downloadProgress.next(100);
        return blob;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedLength = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const progress = Math.round((receivedLength / total) * 100);
        downloadProgress.next(progress);
    }

    const blob = new Blob(chunks);
    minecraftJarBlob.next(blob);
    downloadProgress.next(undefined)
    return blob;
}

let hasInitialized = false;

// Automatically download the Minecraft jar only when the user has agreed to the EULA
agreedEula.observable.subscribe(seen => {
    if (seen && !hasInitialized) {
        hasInitialized = true;
        downloadMinecraftJar()
    }
});
