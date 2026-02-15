import type { DecompileResult } from "../workers/decompile/types.ts";

export type TokenType = "class" | "field" | "method" | "parameter" | "local";

interface BaseToken {
  // The number of characters from the start of the source
  start: number;
  // The length of the token in characters
  length: number;
  // The name of the class this token represents
  className: string;
  // Whether this token is a declaration or a reference
  declaration: boolean;
}

export interface MemberToken extends BaseToken {
  type: "field" | "method";
  // The member name
  name: string;
  // The member descriptor
  descriptor: string;
}

interface NonMethodToken extends BaseToken {
  type: "class" | "parameter" | "local";
}

export type Token = MemberToken | NonMethodToken;

export interface TokenLocation {
  line: number;
  column: number;
  length: number;
}

export function getTokenLocation(result: DecompileResult, token: Token): TokenLocation {
  const sourceUpTo = result.source.slice(0, token.start);
  const line = sourceUpTo.match(/\n/g)!.length + 1;
  const column = sourceUpTo.length - sourceUpTo.lastIndexOf("\n");
  return { line, column, length: token.length };
}
