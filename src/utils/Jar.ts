import { read, type Entry, type Reader, type Zip, readBlob } from "@katana-project/zip";
import type { JarEntryPath } from "./Names";

export interface Jar {
    name: string;
    blob: Blob;
    entries: Partial<Record<JarEntryPath, Entry>>;
}

export async function openJar(name: string, blob: Blob): Promise<Jar> {
    const zip = await readBlob(blob, {
        naive: true
    });
    return new JarImpl(name, blob, zip);
}

// TODO: fix
// export async function streamJar(name: string, url: string): Promise<Jar> {
//     const reader = new HttpStreamReader(url);
//     const zip = await read(reader, {
//         naive: true
//     });
//     return new JarImpl(name, zip);
// }

class JarImpl implements Jar {
    private zip: Zip;
    public name: string;
    public blob: Blob;
    public entries: Partial<Record<JarEntryPath, Entry>> = {};

    constructor(name: string, blob: Blob, zip: Zip) {
        this.name = name;
        this.blob = blob;
        this.zip = zip;
        zip.entries.forEach(entry => {
            this.entries[entry.name as JarEntryPath] = entry;
        });
    }
}

export class HttpStreamReader implements Reader {
    private url: string;
    private onProgress?: (percent: number) => void;
    private signal?: AbortSignal;

    private _lengthCache: number | null = null;

    constructor(url: string, onProgress?: (percent: number) => void, options: { length?: number; signal?: AbortSignal } = {}) {
        this.url = url;
        this.onProgress = onProgress;
        this.signal = options.signal;
        this._lengthCache = options.length ?? null;
    }

    async length(): Promise<number> {
        if (this._lengthCache !== null) {
            return Promise.resolve(this._lengthCache);
        }

        const response = await fetch(this.url, { method: 'HEAD', signal: this.signal });

        if (!response.ok) {
            throw new Error(`Failed to fetch HEAD for ${this.url}: ${response.status} ${response.statusText}`);
        }

        const lengthHeader = response.headers.get('Content-Length');

        if (!lengthHeader) {
            throw new Error(`Content-Length header is missing for ${this.url}`);
        }

        return Promise.resolve(this._lengthCache = parseInt(lengthHeader));
    }

    async read(offset: number, size: number): Promise<Uint8Array> {
        const blob = await this.slice(offset, size);
        const arrayBuffer = await blob.arrayBuffer();
        return new Uint8Array(arrayBuffer);
    }

    async slice(offset: number, size: number): Promise<Blob> {
        const response = await this.fetchRange(offset, size);
        const blob = await consumeResponseWithProgress(response, this.onProgress);
        if (blob.size !== size) {
            throw new Error(`Fetched range size mismatch for ${this.url}: expected ${size}, got ${blob.size}`);
        }
        return blob;
    }

    async fetchRange(offset: number, size: number): Promise<Response> {
        const request = await fetch(this.url, {
            headers: {
                'Range': `bytes=${offset}-${offset + size - 1}`,
            },
            cache: 'no-store',
            signal: this.signal,
        });

        if (request.status !== 206) {
            await request.body?.cancel();
            throw new Error(`Failed to fetch range ${offset}-${offset + size - 1} for ${this.url}: ${request.status} ${request.statusText}`);
        }

        return request;
    }
}

export async function consumeResponseWithProgress(response: Response, onProgress?: (percent: number) => void): Promise<Blob> {
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body || total === 0 || !onProgress) {
        return await response.blob();
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let receivedLength = 0;
    let lastPercent = -1;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        const percent = Math.min((receivedLength / total) * 100, 100);

        const roundedPercent = Math.floor(percent);
        if (roundedPercent !== lastPercent) {
            onProgress(percent);
            lastPercent = roundedPercent;
        }
    }

    return new Blob(chunks);
}
