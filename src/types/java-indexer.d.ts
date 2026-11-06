// Type declarations for TeaVM-generated Java indexer modules

declare module "*/mcsrc.js" {
    export function resetUnpick(): void;
    export function loadUnpickDefinitions(definitions: string[], source: (name: string) => Promise<ArrayBuffer | null>): Promise<void>;
    export function applyUnpick(data: ArrayBuffer): Promise<Int8Array>;
    export function index(data: ArrayBufferLike): void;
    export function getReference(key: string): string[];
    export function getReferenceSize(): number;
    export function getBytecode(classData: ArrayBufferLike[]): string;
    export function getClassData(): string[];
    export function clearDeclarations(): void;
}
