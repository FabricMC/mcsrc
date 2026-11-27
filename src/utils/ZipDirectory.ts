import { read, type Entry } from '@katana-project/zip';
import { HttpStreamReader } from './Jar';

export type ZipDirectoryEntry = Pick<Entry, 'name' | 'crc32' | 'uncompressedSize'>;

function isDirectory(value: unknown): value is ZipDirectoryEntry[] {
    return Array.isArray(value) && value.every(entry => entry !== null && typeof entry === 'object'
        && typeof entry.name === 'string' && Number.isInteger(entry.crc32)
        && Number.isSafeInteger(entry.uncompressedSize) && entry.uncompressedSize >= 0);
}

export async function readZipDirectory(url: string, length: number, signal: AbortSignal): Promise<ZipDirectoryEntry[]> {
    const cacheKey = `https://mcsrc.dev/cache/zip-directories/v1/${encodeURIComponent(url)}/${length}`;
    const load = async () => {
        signal.throwIfAborted();
        let cache: Cache | undefined;
        let cachedEntries: unknown;
        try {
            cache = await globalThis.caches?.open('mcsrc-zip-directories-v1');
            const cached = await cache?.match(cacheKey);
            cachedEntries = await cached?.json();
        } catch {
            // Storage may be unavailable, full, or contain an unreadable entry.
        }

        signal.throwIfAborted();
        if (isDirectory(cachedEntries)) return cachedEntries;

        const zip = await read(new HttpStreamReader(url, undefined, { length, signal }), { naive: true });
        signal.throwIfAborted();
        const entries = zip.entries.map(({ name, crc32, uncompressedSize }) => ({ name, crc32, uncompressedSize }));
        try {
            await cache?.put(cacheKey, Response.json(entries));
        } catch {
            // A cache write failure must not prevent showing class history.
        }
        signal.throwIfAborted();
        return entries;
    };

    // Coordinate concurrent readers, including other tabs, without retaining directories in memory.
    if (globalThis.navigator?.locks) {
        return navigator.locks.request(cacheKey, { signal }, load);
    }
    return load();
}
