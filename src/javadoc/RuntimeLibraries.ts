import { openJar, type Jar } from "../utils/Jar";
import { toArrayBuffer } from "../utils/ArrayBuffer";
import { toClassFilePath } from "../utils/Names";

export interface RuntimeLibrariesConfig {
    id: string;
    files: File[];
}

/** Resolves runtime classes on demand for Javadoc features. */
export class RuntimeLibraries {
    #config: RuntimeLibrariesConfig | undefined;
    #jars: Promise<Jar[]> | undefined;

    load(config?: RuntimeLibrariesConfig): void {
        if (this.#config?.id === config?.id) return;
        this.#config = config;
        this.#jars = undefined;
    }

    async getClassBytes(name: string): Promise<ArrayBuffer | null> {
        this.#jars ??= Promise.all((this.#config?.files ?? []).map(file => openJar(file.name, file)));
        const path = toClassFilePath(name);
        const jars = await this.#jars;
        const entry = jars.find(jar => jar.entries[path])?.entries[path];
        return entry ? toArrayBuffer(await entry.bytes()) : null;
    }
}
