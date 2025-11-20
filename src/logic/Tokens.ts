export type TokenType = 'class' | 'field' | 'method' | 'parameter' | 'local';

export interface Token {
    type: TokenType;
    // The number of characters from the start of the source
    start: number;
    // The length of the token in characters
    length: number;
    // The name of the class this token represents
    className: string;
    // Whether this token is a declaration or a reference
    declaration: boolean;
}