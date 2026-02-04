declare module "@run-slicer/vf/vf.wasm-runtime.js" {
    export function load(
        wasmPath: string,
        options?: { noAutoImports?: boolean; }
    ): Promise<{ exports: typeof import("@run-slicer/vf"); }>;
}

declare module "@run-slicer/vf/vf.runtime.js" {
    export * from "@run-slicer/vf";
}
