import { type Version, DEFAULT_VERSION } from "./versions";

export async function loadRuntime(preferWasm: boolean, version: Version) {
    if (version === "1.11.2") {
        const vf = await import("./vf-1.11.2");
        return await vf.loadRuntime(preferWasm);
    } else if (version === "1.12.0") {
        const vf = await import("./vf-1.12.0");
        return await vf.loadRuntime(preferWasm);
    }

    throw new Error(`Unsupported Vineflower version: ${version}`);
}

export async function decompile(version: Version, name: string | string[], options?: Config) {
    if (version === "1.11.2") {
        const vf = await import("./vf-1.11.2");
        return await vf.decompile(name, options);
    } else if (version === "1.12.0") {
        const vf = await import("./vf-1.12.0");
        return await vf.decompile(name, options);
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