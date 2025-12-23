import Dexie, { type Table } from 'dexie';

export interface UsageEntry {
    key: string;
    value: string;
}

class UsageIndexDatabase extends Dexie {
    [tableName: string]: any;

    constructor(dbName: string, version: string) {
        super(dbName);

        this.version(1).stores({
            [version]: '[key+value], key'
        });
    }
}

export class UsageIndexDB {
    private dbName = 'UsageIndexDB';
    private storeName: string;
    private version: string;
    private db: UsageIndexDatabase | null = null;

    constructor(version: string) {
        this.version = version;
        this.storeName = version;
    }

    async open(): Promise<void> {
        this.db = new UsageIndexDatabase(this.dbName, this.version);
        await this.db.open();
    }

    async batchWrite(entries: UsageEntry[]): Promise<void> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const table: Table<UsageEntry> = this.db.table(this.storeName);
        await table.bulkPut(entries);
    }

    async read(key: string): Promise<string[]> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const table: Table<UsageEntry> = this.db.table(this.storeName);
        const entries = await table.where('key').equals(key).toArray();
        return entries.map(entry => entry.value);
    }

    async clear(): Promise<void> {
        if (!this.db) {
            throw new Error('Database not opened');
        }

        const table: Table<UsageEntry> = this.db.table(this.storeName);
        await table.clear();
    }

    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}
