const DEFAULT_VERSION = "1.11.2";
export type Version = "1.11.2";

export async function loadRuntime(preferWasm: boolean, version: Version = DEFAULT_VERSION) {
    if (version === "1.11.2") {
        const vf1112 = await import("./vf-1.11.2");
        return await vf1112.loadRuntime(preferWasm);
    }

    throw new Error(`Unsupported Vineflower version: ${version}`);
}

export async function decompile(name: string | string[], options?: Config, version: Version = DEFAULT_VERSION) {
    if (version === "1.11.2") {
        const vf1112 = await import("./vf-1.11.2");
        return await vf1112.decompile(name, options);
    }

    throw new Error(`Unsupported Vineflower version: ${version}`);
}

// Abstracted types from @run-slicer/vf to support multiple versions.
export type Options = Record<string, string>;

export interface TokenCollector {
    start: (content: string) => void;
    visitClass: (start: number, length: number, declaration: boolean, name: string) => void;
    visitField: (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string) => void;
    visitMethod: (start: number, length: number, declaration: boolean, className: string, name: string, descriptor: string) => void;
    visitParameter: (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string) => void;
    visitLocal: (start: number, length: number, declaration: boolean, className: string, methodName: string, methodDescriptor: string, index: number, name: string) => void;
    end: () => void;
}

export type LogLevel = "trace" | "info" | "warn" | "error";

export interface Logger {
    writeMessage: (level: LogLevel, message: string, error?: unknown) => void;
    startProcessingClass?: (className: string) => void;
    endProcessingClass?: () => void;
    startReadingClass?: (className: string) => void;
    endReadingClass?: () => void;
    startClass?: (className: string) => void;
    endClass?: () => void;
    startMethod?: (methodName: string) => void;
    endMethod?: () => void;
    startWriteClass?: (className: string) => void;
    endWriteClass?: () => void;
}

export interface Config {
    source?: (name: string) => Promise<Uint8Array | null>;
    resources?: string[];
    options?: Options;
    tokenCollector?: TokenCollector;
    logger?: Logger;
}