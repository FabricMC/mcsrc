import type { Token } from "../../logic/Tokens";
import type { Jar } from "../../utils/Jar";

export type DecompileResult = {
    owner: string;
    className: string;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
};

export type DecompileOption = { key: string, value: string };

export type DecompileData = Record<string, Uint8Array | Promise<Uint8Array>>;

export class DecompileJar {
    jar: Jar;
    proxy: DecompileData;

    constructor(jar: Jar) {
        this.jar = jar;
        this.proxy = new Proxy({}, {
            get(_, className: string) {
                return jar.entries[className + ".class"].bytes()
            }
        })
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
