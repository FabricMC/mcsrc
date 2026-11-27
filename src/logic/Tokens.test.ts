import { expect, it } from 'vitest';
import { getTokenLocation, type Token } from './Tokens';
import { toClassName } from '../utils/Names';
import type { DecompileResult } from '../workers/decompile/types';

function location(source: string, start: number) {
    const token: Token = { className: toClassName('Example'), type: 'class', declaration: true, start, length: 7 };
    const result = { source } as DecompileResult;
    return getTokenLocation(result, token);
}

it('locates declarations on the first line of a default-package source', () => {
    expect(location('class Example {}', 6)).toEqual({ line: 1, column: 7, length: 7 });
});

it('locates declarations after package and blank lines', () => {
    const source = 'package example;\n\nclass Example {}';
    expect(location(source, source.indexOf('Example'))).toEqual({ line: 3, column: 7, length: 7 });
});
