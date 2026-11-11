import { openJar, type Jar } from "../utils/Jar";
import { toArrayBuffer } from "../utils/ArrayBuffer";
import { classNameFromClassFilePath, isClassFilePath, toClassFilePath, type ClassName } from "../utils/Names";

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

    async getClassNames(): Promise<Set<ClassName>> {
        const jars = await this.getJars();
        const names = new Set<ClassName>();
        for (const jar of jars) {
            for (const path of Object.keys(jar.entries)) {
                if (isClassFilePath(path) && !path.startsWith('META-INF/') && !path.endsWith('module-info.class')) {
                    names.add(classNameFromClassFilePath(path));
                }
            }
        }
        return names;
    }

    async getClassBytes(name: string): Promise<ArrayBuffer | null> {
        const path = toClassFilePath(name);
        const jars = await this.getJars();
        const entry = jars.find(jar => jar.entries[path])?.entries[path];
        return entry ? toArrayBuffer(await entry.bytes()) : null;
    }

    private getJars(): Promise<Jar[]> {
        this.#jars ??= Promise.all((this.#config?.files ?? []).map(file => openJar(file.name, file)));
        return this.#jars;
    }
}
