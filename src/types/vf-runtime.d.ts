declare module "vf-1.11.2/vf.wasm-runtime.js" {
    export function load(
        wasmPath: string,
        options?: { noAutoImports?: boolean; }
    ): Promise<{ exports: typeof import("@run-slicer/vf"); }>;
}

declare module "vf-1.11.2/vf.runtime.js" {
    export * from "@run-slicer/vf";
}

declare module "vf-1.11.2" {
    export * from "@run-slicer/vf";
}

declare module "vf-1.12.0/vf.wasm-runtime.js" {
    export function load(
        wasmPath: string,
        options?: { noAutoImports?: boolean; }
    ): Promise<{ exports: typeof import("@run-slicer/vf"); }>;
}

declare module "vf-1.12.0/vf.runtime.js" {
    export * from "@run-slicer/vf";
}

declare module "vf-1.12.0" {
    export * from "@run-slicer/vf";
}