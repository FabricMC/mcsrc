// Type declarations for TeaVM-generated Java indexer modules

declare module "*/mcsrc.js" {
    export interface ClassMember {
        kind: "field" | "method";
        name: string;
        descriptor: string;
        isStatic: boolean;
        parameterNames: (string | null)[];
    }

    export function readClassMembers(classBytes: ArrayBuffer): ClassMember[];

    export interface UnpickDiagnostic {
        definitionIndex: number | null;
        lineNumber: number | null;
        columnNumber: number | null;
        message: string;
    }

    export function resetUnpick(): void;
    export function loadUnpickDefinitions(definitions: string[], source: (name: string) => Promise<ArrayBuffer | null>): Promise<void>;
    export function validateUnpickDefinitions(
        definitions: string[],
        source: (name: string) => Promise<ArrayBuffer | null>,
        hasPackage: (name: string) => Promise<boolean>,
    ): Promise<UnpickDiagnostic | null>;
    export function applyUnpick(data: ArrayBuffer): Promise<Int8Array>;
    export function index(data: ArrayBufferLike): void;
    export function getReference(key: string): string[];
    export function getReferenceSize(): number;
    export function getBytecode(classData: ArrayBufferLike[]): string;
    export function getClassData(): string[];
    export function clearDeclarations(): void;
}
