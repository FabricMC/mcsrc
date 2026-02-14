import type { Token } from "../../logic/Tokens";
import type { Jar } from "../../utils/Jar";

export type DecompileResult = {
    className: string;
    checksum: number;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
};

export type DecompileOption = { key: string, value: string; };

export type DecompileData = {
    [className: string]: undefined | {
        checksum: number;
        data: Uint8Array | Promise<Uint8Array>;
    };
};

export class DecompileJar {
    jar: Jar;
    proxy: DecompileData;

    constructor(jar: Jar) {
        this.jar = jar;
        this.proxy = new Proxy({}, {
            get(_, className: string): DecompileData[""] {
                const entry = jar.entries[className + ".class"];
                if (entry) return {
                    checksum: entry.crc32,
                    data: entry.bytes()
                };
            }
        });
    }

    private _classes: string[] | null = null;
    get classes() {
        if (this._classes) return this._classes;
        this._classes = Object.keys(this.jar.entries)
            .filter(f => f.endsWith(".class"))
            .map(f => f.replace(".class", ""))
            .sort();
        return this._classes;
    }
}
