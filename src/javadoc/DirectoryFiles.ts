export async function getDirectory(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
    let directory = root;
    for (const part of path.split("/")) {
        directory = await directory.getDirectoryHandle(part);
    }
    return directory;
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

