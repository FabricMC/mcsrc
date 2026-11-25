import { JarIndexer } from "../jar-index/types";
import type { RuntimeLibraries } from "../../javadoc/RuntimeLibraries";
import type { Jar } from "../../utils/Jar";
import { toArrayBuffer } from "../../utils/ArrayBuffer";
import { createClassSource, definitionContents, type UnpickConfig } from "../../unpick/UnpickDefinitions";

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
        await bridge.loadUnpickDefinitions(definitionContents(config.definitions), createClassSource(jar, libraries));
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
