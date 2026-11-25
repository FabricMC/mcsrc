export async function getDirectory(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
    let directory = root;
    for (const part of path.split("/")) {
        directory = await directory.getDirectoryHandle(part);
    }
    return directory;
}

export async function writeFile(handle: FileSystemFileHandle, data: FileSystemWriteChunkType): Promise<void> {
    const writable = await handle.createWritable();
    try {
        await writable.write(data);
        await writable.close();
    } catch (error) {
        await writable.abort().catch(() => {});
        throw error;
    }
}

export function isNotFoundError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "NotFoundError";
}

interface DirectoryFile {
    handle: FileSystemFileHandle;
    path: string[];
}

export async function collectFiles(
    directory: FileSystemDirectoryHandle,
    extension: string,
    parentPath: string[] = [],
): Promise<DirectoryFile[]> {
    const result: DirectoryFile[] = [];

    for await (const entry of directory.values()) {
        const path = [...parentPath, entry.name];

        if (entry.kind === "directory") {
            result.push(...await collectFiles(entry, extension, path));
        } else if (entry.name.endsWith(extension)) {
            result.push({ handle: entry, path });
        }
    }

    if (parentPath.length === 0) {
        result.sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
    }

    return result;
}

