import { collectFiles, getDirectory, isNotFoundError } from "./DirectoryFiles";
import { readJavadocDirectory, type JavadocDirectorySource } from "./JavadocStorage";
import type { RuntimeLibrariesConfig } from "./RuntimeLibraries";
import { readUnpickFiles } from "../unpick/UnpickFiles";

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
        const runtimeDirectory = await getDirectory(handle, config.runtimeLibraries).catch((error: unknown) => {
            if (!isNotFoundError(error)) throw error;
            return undefined;
        });
        if (runtimeDirectory) {
            const runtimeFiles = await collectFiles(runtimeDirectory, ".jar");
            const files = await Promise.all(runtimeFiles.map(file => file.handle.getFile()));
            if (files.length > 0) {
                runtimeLibraries = { id: crypto.randomUUID(), files };
            }
        }
    }

    let unpickDirectory: FileSystemDirectoryHandle | undefined;
    if (config.unpickDefinitions) {
        unpickDirectory = await getDirectory(handle, config.unpickDefinitions).catch((error: unknown) => {
            if (runtimeLibraries || !isNotFoundError(error)) throw error;
            return undefined;
        });
    }
    const definitions = unpickDirectory && runtimeLibraries ? await readUnpickFiles(unpickDirectory) : [];

    const directory = await getDirectory(handle, config.mappings);
    const source = await readJavadocDirectory(directory);
    if (runtimeLibraries) source.runtimeLibraries = runtimeLibraries;
    if (unpickDirectory) source.unpickDirectory = unpickDirectory;
    if (definitions.length > 0) source.unpick = { id: crypto.randomUUID(), definitions };
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
