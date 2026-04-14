import * as Comlink from "comlink";
import sqlite3InitModule, { type OpfsDatabase } from "@sqlite.org/sqlite-wasm";

export interface FullTextSearchRegion {
    start: number;
    end: number;
}

export interface FullTextSearchResult {
    key: string;
    snippet: string;
}

export class FullTextSearchWorker {
    #db?: OpfsDatabase;

    async init(name: string): Promise<string | undefined> {
        try {
            console.log("Loading SQLite3 Module...");
            const sqlite3 = await sqlite3InitModule();
            console.log("Loading SQLite3 Module... Done.");

            // TODO: change the db name
            this.#db = new sqlite3.oo1.OpfsDb(`/fts-test.${name}.sqlite3`);
            this.#db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS sources USING fts5(key, source);");
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

        this.#db.exec({
            sql: "INSERT INTO sources(key, source) VALUES(?, ?)",
            bind: [key, source]
        });
    }

    find(query: string): FullTextSearchResult[] {
        if (!this.#db) {
            console.error("DB not initialized");
            return [];
        }

        const res = this.#db.selectObjects(`
            SELECT
                key,
                snippet(sources, -1, '[', ']', '...', 10) AS snippet
            FROM sources
            WHERE source MATCH ?;
        `, [query]);

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
