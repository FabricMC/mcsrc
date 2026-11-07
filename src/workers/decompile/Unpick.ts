import { JarIndexer } from "../jar-index/types";
import type { RuntimeLibraries } from "../../javadoc/RuntimeLibraries";
import type { Jar } from "../../utils/Jar";
import { toArrayBuffer } from "../../utils/ArrayBuffer";
import { toClassFilePath } from "../../utils/Names";

export interface UnpickConfig {
    id: string;
    definitions: { path: string; content: string }[];
}

export class UnpickProcessor {
    #indexer = new JarIndexer();
    #id: string | undefined;
    #jarName: string | undefined;

    async load(config: UnpickConfig, jar: Jar, libraries: RuntimeLibraries): Promise<void> {
        if (this.#id === config.id && this.#jarName === jar.name) return;
        this.#id = undefined;
        const bridge = await this.#indexer.getIndexer();
        bridge.resetUnpick();
        for (const definition of config.definitions) {
            if (!definition.content.trim()) {
                throw new Error(`Empty Unpick definition: ${definition.path}`);
            }
        }
        await bridge.loadUnpickDefinitions(config.definitions.map(definition => definition.content), async name => {
            const path = toClassFilePath(name);
            const entry = jar.entries[path];
            return entry ? toArrayBuffer(await entry.bytes()) : libraries.getClassBytes(name);
        });
        this.#id = config.id;
        this.#jarName = jar.name;
    }

    async reset(): Promise<void> {
        const bridge = await this.#indexer.getIndexer();
        bridge.resetUnpick();
        this.#id = undefined;
        this.#jarName = undefined;
    }

    async apply(bytes: Uint8Array): Promise<Uint8Array> {
        const bridge = await this.#indexer.getIndexer();
        return new Uint8Array(await bridge.applyUnpick(toArrayBuffer(bytes)));
    }
}
