import type * as javaRuntime from "../../java/build/generated/teavm/js/mcsrc.js";
import type { RuntimeLibraries } from "../javadoc/RuntimeLibraries";
import { toArrayBuffer } from "../utils/ArrayBuffer";
import type { Jar } from "../utils/Jar";
import { isClassFilePath, toClassFilePath } from "../utils/Names";

export interface UnpickDefinition {
    path: string;
    content: string;
}

export interface UnpickConfig {
    id: string;
    definitions: UnpickDefinition[];
}

export type UnpickValidationBridge = Pick<typeof javaRuntime, "validateUnpickDefinitions">;

export function validateUnpickDefinitions(
    bridge: UnpickValidationBridge,
    definitions: UnpickDefinition[],
    jar: Jar,
    libraries: RuntimeLibraries,
): Promise<javaRuntime.UnpickDiagnostic | null> {
    return bridge.validateUnpickDefinitions(definitionContents(definitions), createClassSource(jar, libraries), async name => {
        const prefix = `${name.replaceAll(".", "/")}/`;
        const inPackage = (path: string) => path.startsWith(prefix) && path.indexOf("/", prefix.length) === -1;
        if (Object.keys(jar.entries).some(path => isClassFilePath(path) && inPackage(path))) return true;
        return Array.from(await libraries.getClassNames()).some(inPackage);
    });
}

export function definitionContents(definitions: UnpickDefinition[]): string[] {
    // TeaVM's BufferedReader can lose a version header at EOF without a newline.
    return definitions.map(({ content }) => content.endsWith("\n") ? content : `${content}\n`);
}

export function createClassSource(jar: Jar, libraries: RuntimeLibraries) {
    return async (name: string) => {
        const entry = jar.entries[toClassFilePath(name)];
        return entry ? toArrayBuffer(await entry.bytes()) : libraries.getClassBytes(name);
    };
}
