import * as Comlink from "comlink";

export interface FullTextSearchOptions {
    pre?: string;
    post?: string;
    ellipsis?: string;
    maxTokens?: number;
}

export interface FullTextSearchRegion {
    start: number;
    end: number;
    snippet: string;
}

export interface FullTextSearchResult {
    key: string;
    regions: FullTextSearchRegion[]
}

export class FullTextSearchWorker {
    #sources = new Map<string, string>();
    #enc = new TextEncoder();

    init(_name: string): void {}

    destroy() {
        close();
    }

    index(key: string, source: string) {
        this.#sources.set(key, source);
    }

    find(query: string, options?: FullTextSearchOptions): FullTextSearchResult[] {
        return this.findByRegex(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i', options);
    }

    findByRegex(pattern: string, flags: string, options?: FullTextSearchOptions): FullTextSearchResult[] {
        const re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        const pre = options?.pre ?? "[";
        const post = options?.post ?? "]";
        const ellipsis = options?.ellipsis ?? "…";
        const contextChars = 80;

        console.log("Starting search...");
        const startTime = performance.now();

        const results: FullTextSearchResult[] = [];

        for (const [key, source] of this.#sources) {
            re.lastIndex = 0;
            const regions: FullTextSearchRegion[] = [];

            let m: RegExpExecArray | null;
            while ((m = re.exec(source)) !== null) {
                const charStart = m.index;
                const charEnd = charStart + m[0].length;

                const byteStart = this.#enc.encode(source.slice(0, charStart)).length;
                const byteEnd = byteStart + this.#enc.encode(m[0]).length;

                const snipCharStart = Math.max(0, charStart - contextChars);
                const snipCharEnd = Math.min(source.length, charEnd + contextChars);
                const snippet =
                    (snipCharStart > 0 ? ellipsis : '') +
                    source.slice(snipCharStart, charStart) +
                    pre + m[0] + post +
                    source.slice(charEnd, snipCharEnd) +
                    (snipCharEnd < source.length ? ellipsis : '');

                regions.push({ start: byteStart, end: byteEnd, snippet });
            }

            if (regions.length > 0) {
                results.push({ key, regions });
            }
        }

        const elapsedMs = performance.now() - startTime;
        console.log(`Finished in ${elapsedMs.toFixed(3)} ms`);
        return results;
    }
}
Comlink.expose(new FullTextSearchWorker());
