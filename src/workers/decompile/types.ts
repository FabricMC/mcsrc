import type { Token } from "../../logic/Tokens";
import type { Jar } from "../../utils/Jar";
import { classNameFromClassFilePath, isClassFilePath, toClassFilePath, type ClassName } from "../../utils/Names";

export type DecompileResult = {
    className: ClassName;
    checksum: number;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
};

export type DecompileOption = { key: string, value: string; };

export type DecompileData = Partial<Record<ClassName, {
        checksum: number;
        data: Uint8Array | Promise<Uint8Array>;
    }>>;
type DecompileDataEntry = NonNullable<DecompileData[ClassName]>;

export class DecompileJar {
    jar: Jar;
    proxy: DecompileData;

    constructor(jar: Jar) {
        this.jar = jar;
        this.proxy = new Proxy({}, {
            get(_, className: string): DecompileDataEntry | undefined {
                const entry = jar.entries[toClassFilePath(className)];
                if (entry) return {
                    checksum: entry.crc32,
                    data: entry.bytes()
                };
            }
        });
    }

    private _classes: ClassName[] | null = null;
    get classes() {
        if (this._classes) return this._classes;
        this._classes = Object.keys(this.jar.entries)
            .filter(isClassFilePath)
            .map(classNameFromClassFilePath)
            .sort();
        return this._classes;
    }
}
