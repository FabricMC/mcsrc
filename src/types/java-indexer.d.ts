// Type declarations for TeaVM-generated Java indexer modules

declare module "*/java.js" {
    export function index(data: ArrayBufferLike): void;
    export function getReference(key: string): string[];
    export function getReferenceSize(): number;
    export function getBytecode(classData: ArrayBufferLike[]): string;
    export function getClassData(): string[];
}
