import type { Token } from "../../logic/Tokens";

export type DecompileResult = {
    owner: string;
    className: string;
    source: string;
    tokens: Token[];
    language: 'java' | 'bytecode';
};

export type DecompileOption = { key: string, value: string };

export type DecompileData = Record<string, Uint8Array>;
