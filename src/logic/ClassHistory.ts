import { readZipDirectory, type ZipDirectoryEntry } from '../utils/ZipDirectory';
import { outerClassName, type ClassName } from '../utils/Names';
import type { VersionListEntry } from './MinecraftApi';

type ClassChange = 'changed' | 'unchanged' | 'added' | 'removed';

export interface ClassHistoryEntry {
    version: string;
    status: 'queued' | 'checking' | 'checked' | 'error';
    fingerprint?: string | null;
    error?: string;
}

function classFamilyFingerprint(entries: ZipDirectoryEntry[], className: ClassName): string | null {
    const outerName = outerClassName(className);
    const family = entries.filter(entry => entry.name === `${outerName}.class`
        || (entry.name.startsWith(`${outerName}$`) && entry.name.endsWith('.class')));
    if (!family.some(entry => entry.name === `${outerName}.class`)) return null;
    family.sort((left, right) => left.name.localeCompare(right.name));

    return family.map(entry => `${entry.name}:${entry.crc32}:${entry.uncompressedSize}`).join('\n');
}

export function compareClassFingerprints(newer: string | null, older: string | null): ClassChange {
    if (newer === older) return 'unchanged';
    if (older === null) return 'added';
    if (newer === null) return 'removed';
    return 'changed';
}

export function classHistoryBounds(entries: ClassHistoryEntry[], currentVersion: string) {
    const currentIndex = entries.findIndex(entry => entry.version === currentVersion);
    let firstIndex = 0;
    let lastIndex = entries.length - 1;
    for (let index = 0; index < entries.length - 1; index++) {
        const newer = entries[index].fingerprint;
        const older = entries[index + 1].fingerprint;
        if (newer === undefined || older === undefined) continue;
        if (index < currentIndex && newer === null && older !== null) firstIndex = index;
        if (index >= currentIndex && newer !== null && older === null) {
            lastIndex = index;
            break;
        }
    }
    return { firstIndex, lastIndex };
}

export async function fetchClassFingerprint(version: VersionListEntry, className: ClassName, signal: AbortSignal) {
    signal.throwIfAborted();
    const response = await fetch(version.url, { signal });
    if (!response.ok) throw new Error(`Version metadata: HTTP ${response.status}`);
    const manifest = await response.json() as { downloads?: { client?: { url: string; size: number } } } | null;
    const client = manifest?.downloads?.client;
    if (!client || typeof client.url !== 'string' || !Number.isSafeInteger(client.size) || client.size <= 0) {
        throw new Error('No client JAR available');
    }

    const entries = await readZipDirectory(client.url, client.size, signal);
    signal.throwIfAborted();
    return classFamilyFingerprint(entries, className);
}
