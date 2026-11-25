import type { UnpickDefinition } from "./UnpickDefinitions";
import { collectFiles, getDirectory, isNotFoundError, writeFile } from "../javadoc/DirectoryFiles";

export async function readUnpickFiles(directory: FileSystemDirectoryHandle): Promise<UnpickDefinition[]> {
    const files = await collectFiles(directory, ".unpick");
    return Promise.all(files.map(async file => ({
        path: file.path.join("/"),
        content: await (await file.handle.getFile()).text(),
    })));
}

export async function changeUnpickFile(
    directory: FileSystemDirectoryHandle,
    path: string,
    previous: string | undefined,
    content: string | undefined,
): Promise<void> {
    const separator = path.lastIndexOf("/");
    const parent = separator === -1 ? directory : await getDirectory(directory, path.slice(0, separator));
    const name = path.slice(separator + 1);
    const existing = await parent.getFileHandle(name).catch((error: unknown) => {
        if (!isNotFoundError(error)) throw error;
    });
    const diskContent = existing ? await (await existing.getFile()).text() : undefined;
    if (diskContent !== previous) {
        if (previous === undefined) throw new Error(`${path} already exists.`);
        throw new Error(`${path} changed on disk.`);
    }

    if (content === undefined) {
        await parent.removeEntry(name);
        return;
    }

    const handle = existing ?? await parent.getFileHandle(name, { create: true });
    try {
        await writeFile(handle, content);
    } catch (error) {
        if (!existing) await parent.removeEntry(name).catch(() => {});
        throw error;
    }
}
