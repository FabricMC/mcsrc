import { describe, expect, it } from 'vitest';
import { formatDescriptor, parseFieldDescriptor, parseMethodDescriptor } from './JavaDescriptors';

describe('Java descriptors', () => {
    it('separates parameter types and return types, including arrays and nested classes', () => {
        expect(parseMethodDescriptor('(I[[Ljava/lang/String;Lexample/Owner$Nested;)[J')).toEqual({
            parameterTypes: ['int', 'java.lang.String[][]', 'example.Owner$Nested'],
            returnType: 'long[]',
        });
        expect(parseMethodDescriptor('()V')).toEqual({ parameterTypes: [], returnType: 'void' });
    });

    it('preserves the existing display format for fields and methods', () => {
        expect(parseFieldDescriptor('[Ljava/lang/String;')).toBe('java.lang.String[]');
        expect(formatDescriptor('I')).toBe('int');
        expect(formatDescriptor('(Ljava/lang/String;I)V')).toBe('(java.lang.String, int) → void');
    });

    it('rejects incomplete descriptors instead of looping past the end', () => {
        expect(() => parseMethodDescriptor('(I')).toThrow('Invalid JVM descriptor');
        expect(() => parseFieldDescriptor('Ljava/lang/String')).toThrow('Invalid JVM descriptor');
    });
});
