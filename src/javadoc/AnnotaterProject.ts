import { collectFiles, getDirectory } from "./DirectoryFiles";
import { readJavadocDirectory, type JavadocDirectorySource } from "./JavadocStorage";
import type { RuntimeLibrariesConfig } from "./RuntimeLibraries";
import type { UnpickConfig } from "../workers/decompile/Unpick";

export interface AnnotaterConfig {
    /** Path to the Enigma mappings subdirectory, relative to the project root. */
    mappings: string;
    runtimeLibraries?: string;
    unpickDefinitions?: string;
    /** Minecraft version ID. */
    version: string;
}

export async function readAnnotaterDirectory(handle: FileSystemDirectoryHandle): Promise<{
    source: JavadocDirectorySource;
    version: string;
}> {
    const configHandle = await handle.getFileHandle("config.json");
    const configFile = await configHandle.getFile();
    const config = parseAnnotaterConfig(await configFile.text());

    let runtimeLibraries: RuntimeLibrariesConfig | undefined;
    if (config.runtimeLibraries) {
        const runtimeDirectory = await getDirectory(handle, config.runtimeLibraries);
        const runtimeFiles = await collectFiles(runtimeDirectory, ".jar");
        const files = await Promise.all(runtimeFiles.map(file => file.handle.getFile()));
        if (files.length > 0) {
            runtimeLibraries = { id: crypto.randomUUID(), files };
        }
    }

    let unpick: UnpickConfig | undefined;
    if (config.unpickDefinitions && runtimeLibraries) {
        const definitionsDirectory = await getDirectory(handle, config.unpickDefinitions);
        const definitionFiles = await collectFiles(definitionsDirectory, ".unpick");
        if (definitionFiles.length > 0) {
            const definitions = await Promise.all(definitionFiles.map(async file => ({
                path: file.path.join("/"),
                content: await (await file.handle.getFile()).text(),
            })));
            unpick = { id: crypto.randomUUID(), definitions };
        }
    }

    const directory = await getDirectory(handle, config.mappings);
    const source = await readJavadocDirectory(directory);
    if (runtimeLibraries) source.runtimeLibraries = runtimeLibraries;
    if (unpick) source.unpick = unpick;
    return { source, version: config.version };
}

function parseAnnotaterConfig(json: string): AnnotaterConfig {
    const config: unknown = JSON.parse(json);

    if (typeof config !== "object" || config === null
        || !("version" in config) || typeof config.version !== "string" || !config.version.trim()
        || !("mappings" in config) || typeof config.mappings !== "string") {
        throw new Error('config.json must contain a Minecraft "version" and a relative "mappings" directory path.');
    }

    for (const key of ["mappings", "runtimeLibraries", "unpickDefinitions"] as const) {
        const value = config[key as keyof typeof config];
        if (value === undefined) continue;
        if (typeof value !== "string" || value.split("/").some(part => !part || part === "." || part === ".." || /[\\:]/.test(part))) {
            throw new Error(`The "${key}" path must point to a subdirectory, using forward slashes.`);
        }
    }

    return { ...config, version: config.version.trim() } as AnnotaterConfig;
}
