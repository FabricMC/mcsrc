import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { minecraftJar } from './MinecraftApi';
import * as decompileWorker from '../workers/decompile/client';

export interface GrepMatch {
    className: string;
    lineNumber: number;
    lineText: string;
}

export interface GrepOptions {
    regex?: boolean;
    caseSensitive?: boolean;
    wholeWord?: boolean;
}

export interface GrepProgress {
    done: number;
    total: number;
    phase: 'scanning' | 'decompiling';
}

export const grepResults = new BehaviorSubject<GrepMatch[]>([]);
export const grepRunning = new BehaviorSubject<boolean>(false);
export const grepProgress = new BehaviorSubject<GrepProgress>({ done: 0, total: 0, phase: 'scanning' });

let cancelFlag = false;

export function cancelGrep() {
    cancelFlag = true;
}

function extractConstantPoolStrings(bytes: Uint8Array): string[] {
    if (bytes.length < 10) return [];
    if (bytes[0] !== 0xCA || bytes[1] !== 0xFE || bytes[2] !== 0xBA || bytes[3] !== 0xBE) return [];

    let offset = 8;
    const cpCount = (bytes[offset] << 8) | bytes[offset + 1];
    offset += 2;

    const strings: string[] = [];
    const decoder = new TextDecoder('utf-8', { fatal: false });

    for (let i = 1; i < cpCount; i++) {
        if (offset >= bytes.length) break;
        const tag = bytes[offset++];

        switch (tag) {
            case 1: {
                const len = (bytes[offset] << 8) | bytes[offset + 1];
                offset += 2;
                strings.push(decoder.decode(bytes.subarray(offset, offset + len)));
                offset += len;
                break;
            }
            case 3: case 4:
                offset += 4; break;
            case 5: case 6:
                offset += 8; i++; break;
            case 7: case 8: case 16: case 19: case 20:
                offset += 2; break;
            case 9: case 10: case 11: case 12: case 17: case 18:
                offset += 4; break;
            case 15:
                offset += 3; break;
            default:
                return strings;
        }
    }

    return strings;
}

function buildPattern(query: string, options: GrepOptions): RegExp {
    const flags = options.caseSensitive ? 'g' : 'gi';
    if (options.regex) return new RegExp(query, flags);
    let escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (options.wholeWord) escaped = `\\b${escaped}\\b`;
    return new RegExp(escaped, flags);
}

const SCAN_BATCH = 50;

export async function runGrep(query: string, options: GrepOptions = {}) {
    if (!query.trim()) return;

    cancelFlag = false;
    grepResults.next([]);
    grepRunning.next(true);
    grepProgress.next({ done: 0, total: 0, phase: 'scanning' });

    try {
        const mcJar = await firstValueFrom(minecraftJar);
        const jar = mcJar.jar;
        const pattern = buildPattern(query, options);

        const classNames = Object.keys(jar.entries)
            .filter(k => k.endsWith('.class') && !k.includes('$'))
            .map(k => k.replace('.class', ''));

        const total = classNames.length;
        grepProgress.next({ done: 0, total, phase: 'scanning' });

        const candidates: string[] = [];
        let scanned = 0;

        for (let i = 0; i < classNames.length; i += SCAN_BATCH) {
            if (cancelFlag) break;

            const batch = classNames.slice(i, Math.min(i + SCAN_BATCH, classNames.length));

            await Promise.all(batch.map(async className => {
                const entry = jar.entries[className + '.class'];
                if (!entry) return;
                try {
                    const bytes = await entry.bytes();
                    const strings = extractConstantPoolStrings(bytes);
                    for (let s = 0; s < strings.length; s++) {
                        pattern.lastIndex = 0;
                        if (pattern.test(strings[s])) {
                            candidates.push(className);
                            return;
                        }
                    }
                } catch (_e) { /* skip */ }
            }));

            scanned += batch.length;
            grepProgress.next({ done: scanned, total, phase: 'scanning' });
            await new Promise(r => setTimeout(r, 0));
        }

        if (cancelFlag) return;

        const accumulated: GrepMatch[] = [];
        grepProgress.next({ done: 0, total: candidates.length, phase: 'decompiling' });

        for (let i = 0; i < candidates.length; i++) {
            if (cancelFlag) break;

            const className = candidates[i];
            try {
                const result = await decompileWorker.decompileClass(className, jar);
                const lines = result.source.split('\n');
                for (let ln = 0; ln < lines.length; ln++) {
                    pattern.lastIndex = 0;
                    if (pattern.test(lines[ln])) {
                        accumulated.push({
                            className,
                            lineNumber: ln + 1,
                            lineText: lines[ln].trim(),
                        });
                    }
                }
                if (accumulated.length > grepResults.value.length) {
                    grepResults.next(accumulated.slice());
                }
            } catch (_e) { /* skip */ }

            grepProgress.next({ done: i + 1, total: candidates.length, phase: 'decompiling' });
            if (i % 4 === 0) await new Promise(r => setTimeout(r, 0));
        }

    } finally {
        grepRunning.next(false);
    }
}