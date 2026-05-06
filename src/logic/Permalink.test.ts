import { describe, it, expect, vi } from 'vitest';

// Mock the Settings module
vi.mock('./Settings', () => ({
    resetPermalinkAffectingSettings: vi.fn(),
    supportsPermalinking: { pipe: vi.fn() }
}));

// Mock the State module to prevent initialization issues
vi.mock('./State', () => ({
    selectedMinecraftVersion: { subscribe: vi.fn() },
    selectedFile: { subscribe: vi.fn() },
    selectedLines: { subscribe: vi.fn() },
    diffView: { subscribe: vi.fn() }
}));

// Import the actual parsing function
import { parsePathToState } from './Permalink';

describe('Permalink', () => {
    describe('parsePathToState', () => {
        describe('Default State', () => {
            it('should return default state when path is empty', () => {
                expect(parsePathToState('')).toEqual(null);
            });

            it('should return null when path has insufficient segments', () => {
                expect(parsePathToState('1')).toEqual(null);
                expect(parsePathToState('1/1.21')).toEqual(null);
            });

            it('should return default state when path is malformed', () => {
                expect(parsePathToState('//')).toEqual(null);
            });
        });

        describe('Basic Path Parsing', () => {
            it('should parse simple permalink with version, mc version, and file', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting')!;

                expect(state.version).toBe(1);
                expect(state.minecraftVersion).toBe('1.21');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.selectedLines).toBe(null);
            });

            it('should append .class if not present', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting')!;
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
            });

            it('should not duplicate .class extension', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting.class')!;
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
            });

            it('should handle nested package paths', () => {
                const state = parsePathToState('1/1.21/net/minecraft/world/entity/player/Player')!;
                expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
            });
        });

        describe('Line Number Parsing', () => {
            it('should parse single line number with #', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting#L123')!;

                expect(state.selectedLines).toEqual({
                    line: 123,
                    lineEnd: undefined
                });
            });

            it('should parse line range with #', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting#L10-20')!;

                expect(state.selectedLines).toEqual({
                    line: 10,
                    lineEnd: 20
                });
            });

            it('should handle URL-encoded line marker (%23)', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting%23L50')!;

                expect(state.selectedLines).toEqual({
                    line: 50,
                    lineEnd: undefined
                });
            });

            it('should handle URL-encoded line range (%23)', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting%23L10-20')!;

                expect(state.selectedLines).toEqual({
                    line: 10,
                    lineEnd: 20
                });
            });

            it('should handle line number at end of complex path', () => {
                const state = parsePathToState('1/1.21/net/minecraft/world/entity/player/Player#L456')!;

                expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                expect(state.selectedLines).toEqual({
                    line: 456,
                    lineEnd: undefined
                });
            });

            it('should return null selectedLines when no line number present', () => {
                const state = parsePathToState('1/1.21/net/minecraft/ChatFormatting')!;
                expect(state.selectedLines).toBe(null);
            });
        });

        describe('URL Decoding', () => {
            it('should decode URL-encoded minecraft version', () => {
                const state = parsePathToState('1/1.21%2B/net/minecraft/ChatFormatting')!;
                expect(state.minecraftVersion).toBe('1.21+');
            });

            it('should handle spaces in version (unlikely but possible)', () => {
                const state = parsePathToState('1/test%20version/net/minecraft/ChatFormatting')!;
                expect(state.minecraftVersion).toBe('test version');
            });
        });

        describe('Backwards Compatibility', () => {
            it('should handle legacy version name 25w45a', () => {
                const state = parsePathToState('1/25w45a/net/minecraft/ChatFormatting')!;
                expect(state.minecraftVersion).toBe('25w45a_unobfuscated');
            });

            it('should not modify other version names', () => {
                const state = parsePathToState('1/25w46a/net/minecraft/ChatFormatting')!;
                expect(state.minecraftVersion).toBe('25w46a');
            });

            it('should handle the legacy version with line numbers', () => {
                const state = parsePathToState('1/25w45a/net/minecraft/ChatFormatting#L100')!;

                expect(state.minecraftVersion).toBe('25w45a_unobfuscated');
                expect(state.selectedLines).toEqual({
                    line: 100,
                    lineEnd: undefined
                });
            });
        });

        describe('Diff Path Parsing', () => {
            it('should parse a diff permalink', () => {
                const state = parsePathToState('1/diff/1.21/1.21.4/net/minecraft/ChatFormatting')!;

                expect(state.version).toBe(1);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.selectedLines).toBe(null);
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21' });
            });

            it('should parse a diff permalink with a nested file path', () => {
                const state = parsePathToState('1/diff/1.21/1.21.4/net/minecraft/world/entity/player/Player')!;

                expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21' });
            });

            it('should not append .class if already present in diff path', () => {
                const state = parsePathToState('1/diff/1.21/1.21.4/net/minecraft/ChatFormatting.class')!;
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
            });

            it('should URL-decode versions in diff path', () => {
                const state = parsePathToState('1/diff/1.21%2B/1.21.4%2B/net/minecraft/ChatFormatting')!;
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21+' });
                expect(state.minecraftVersion).toBe('1.21.4+');
            });

            it('should parse a diff permalink without a file', () => {
                const state = parsePathToState('1/diff/1.21/1.21.4')!;

                expect(state.version).toBe(1);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBeUndefined();
                expect(state.selectedLines).toBe(null);
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21' });
            });

            it('should return null when diff path has insufficient segments', () => {
                expect(parsePathToState('1/diff/1.21')).toBeNull();
                expect(parsePathToState('1/diff')).toBeNull();
            });

            it('should not set diff when path is not a diff path', () => {
                const state = parsePathToState('1/1.21.4/net/minecraft/ChatFormatting')!;
                expect(state.diff).toBeUndefined();
            });
        });

        describe('Version 2 URLs (/2/)', () => {
            it('should parse a /2/ permalink with version 2', () => {
                const state = parsePathToState('2/1.21/net/minecraft/ChatFormatting')!;

                expect(state.version).toBe(2);
                expect(state.minecraftVersion).toBe('1.21');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.selectedLines).toBe(null);
            });

            it('should parse a /2/ permalink with line numbers', () => {
                const state = parsePathToState('2/1.21.4/net/minecraft/server/MinecraftServer#L100-200')!;

                expect(state.version).toBe(2);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBe('net/minecraft/server/MinecraftServer.class');
                expect(state.selectedLines).toEqual({ line: 100, lineEnd: 200 });
            });

            it('should parse a /2/ diff permalink', () => {
                const state = parsePathToState('2/diff/1.21/1.21.4/net/minecraft/ChatFormatting')!;

                expect(state.version).toBe(2);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21' });
            });

            it('should parse a /2/ diff permalink without a file', () => {
                const state = parsePathToState('2/diff/1.21/1.21.4')!;

                expect(state.version).toBe(2);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBeUndefined();
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21' });
            });
        });

        describe('Real-world Examples', () => {
            it('should parse multiline permalink', () => {
                const state = parsePathToState('1/1.21.4/net/minecraft/server/MinecraftServer#L250-260')!;

                expect(state.version).toBe(1);
                expect(state.minecraftVersion).toBe('1.21.4');
                expect(state.file).toBe('net/minecraft/server/MinecraftServer.class');
                expect(state.selectedLines).toEqual({
                    line: 250,
                    lineEnd: 260
                });
            });

            it('should parse a real-world diff permalink', () => {
                const state = parsePathToState('1/diff/1.21.4/1.21.5/net/minecraft/server/MinecraftServer')!;

                expect(state.version).toBe(1);
                expect(state.minecraftVersion).toBe('1.21.5');
                expect(state.file).toBe('net/minecraft/server/MinecraftServer.class');
                expect(state.diff).toEqual({ leftMinecraftVersion: '1.21.4' });
            });
        });
    });
});
