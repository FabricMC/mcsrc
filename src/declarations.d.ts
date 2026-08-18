declare module "*/mcsrc.wasm-runtime.js" {
    export async function load(src: string);
}

interface FilePickerAcceptType {
    description?: string;
    accept: Record<string, string[]>;
}

interface OpenFilePickerOptions {
    multiple?: boolean;
    types?: FilePickerAcceptType[];
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: FilePickerAcceptType[];
}

interface DirectoryPickerOptions {
    mode?: "read" | "readwrite";
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: "directory";
    values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface Window {
    showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
