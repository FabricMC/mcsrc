import * as Comlink from "comlink";
import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";

/** https://www.sqlite.org/fts5.html#the_snippet_function */
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
    #db?: Database;
    #enc = new TextEncoder();
    #dec = new TextDecoder();

    async init(name: string): Promise<string | undefined> {
        try {
            console.log("Loading SQLite3 Module...");
            const sqlite3 = await sqlite3InitModule();
            console.log("Loading SQLite3 Module... Done.");

            this.#db = new sqlite3.oo1.DB(`/fts.${name}.sqlite3`);
            this.#db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS sources USING fts5(key, source, tokenize='porter mcsrc_tokenizer');");
            return undefined;
        } catch (err: any) {
            console.error(err);
            return String(err);
        }
    }

    destroy() {
        this.#db?.close();
        close();
    }

    index(key: string, source: string) {
        if (!this.#db) {
            console.error("DB not initialized");
            return;
        }

        source = source
            .replace(/^\s*package\s+[^\r\n;]+;\s*\r?\n?/m, "")
            .replace(/^\s*import\s+[^\r\n;]+;\s*\r?\n?/gm, "")
            .trim();

        this.#db.exec({
            sql: "INSERT INTO sources(key, source) VALUES(?, ?)",
            bind: [key, source]
        });
    }

    find(query: string, options?: FullTextSearchOptions): FullTextSearchResult[] {
        if (!this.#db) {
            console.error("DB not initialized");
            return [];
        }

        console.log("Starting full text search...");
        const startTime = performance.now();
        const res = this.#db.selectObjects(`
            SELECT
                key,
                mcsrc_offsets(sources, ?, ?, ?, ?) AS offsets
            FROM sources
            WHERE source MATCH ?
            ORDER BY rank;
        `, [options?.pre ?? "[", options?.post ?? "]", options?.ellipsis ?? "…", options?.maxTokens ?? 10, query]);

        const out = res.map((r: any) => ({
            key: r["key"] as string,
            regions: this.#parseOffsets(r["offsets"] as string),
        }));

        const elapsedMs = performance.now() - startTime;
        console.log(`Finished in ${elapsedMs.toFixed(3)} ms`);
        return out;
    }

    #parseOffsets(s: string): FullTextSearchRegion[] {
        if (!s) return [];

        const bytes = this.#enc.encode(s);
        const regions: FullTextSearchRegion[] = [];
        let pos = 0;

        while (pos < bytes.length) {
            const newline = bytes.indexOf(10, pos); // '\n'
            const header = this.#dec.decode(bytes.slice(pos, newline));
            const [_col, _phrase, byteOffset, byteSize, snippetByteLen] = header.trim().split(/\s+/).map(Number);
            pos = newline + 1;

            const snippetBytes = bytes.slice(pos, pos + snippetByteLen);
            const snippet = this.#dec.decode(snippetBytes);
            regions.push({
                start: byteOffset,
                end: byteOffset + byteSize,
                snippet
            });
            pos += snippetByteLen;
        }

        return regions;
    }
}
Comlink.expose(new FullTextSearchWorker());
