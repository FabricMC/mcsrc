declare module "@run-slicer/vf/vf.wasm-runtime.js" {
    export function load(
        wasmPath: string,
        options?: { noAutoImports?: boolean; }
    ): Promise<{ exports: { decompile: (name: string, options: any) => Promise<string>; }; }>;
}
