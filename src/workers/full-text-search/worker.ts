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
}

export interface FullTextSearchResult {
    key: string;
    snippet: string;
}

export class FullTextSearchWorker {
    #db?: Database;

    async init(name: string): Promise<string | undefined> {
        try {
            console.log("Loading SQLite3 Module...");
            const sqlite3 = await sqlite3InitModule();
            console.log("Loading SQLite3 Module... Done.");

            this.#db = new sqlite3.oo1.DB(`/fts.${name}.sqlite3`);
            this.#db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS sources USING fts5(key, source, tokenize='porter');");
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
                snippet(sources, -1, ?, ?, ?, ?) AS snippet
            FROM sources
            WHERE source MATCH ?;
        `, [options?.pre ?? "[", options?.post ?? "]", options?.ellipsis ?? "…", options?.maxTokens ?? 10, query]);
        const elapsedMs = performance.now() - startTime;
        console.log(`Finished in ${elapsedMs} ms`);

        return res.map((r: any) => ({
            key: r["key"] as string,
            snippet: r["snippet"] as string
        }));
    }

    // TODO: figure out how to get offsets in FTS5
    // require creating SQLite extension.
    #parseOffsets(s: string): FullTextSearchRegion[] {
        if (!s) return [];

        const parts = s.trim().split(/\s+/).map(Number);
        const regions: FullTextSearchRegion[] = [];

        // [col] [startToken] [endToken] [termIndex] ...
        for (let i = 0; i + 3 < parts.length; i += 4) {
            const startToken = parts[i + 1];
            const endToken = parts[i + 2];
            if (Number.isFinite(startToken) && Number.isFinite(endToken)) {
                regions.push({ start: startToken, end: endToken });
            }
        }

        return regions;
    }
}
Comlink.expose(new FullTextSearchWorker());
