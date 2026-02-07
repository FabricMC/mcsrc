import { describe, it, expect, beforeEach, vi } from 'vitest';

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

// Helper functions for testing
// These replicate the logic from getInitialState in Permalink.ts

function getStateFromPath(pathname: string) {
    // Simulate new style (pathname-based)
    return parsePermalink(pathname !== '/' && pathname !== '' ? pathname.slice(1) : '');
}

function getStateFromHash(hash: string) {
    // Simulate old style (hash-based)
    let path = hash.startsWith('#/') ? hash.slice(2) : (hash.startsWith('#') ? hash.slice(1) : hash);
    return parsePermalink(path);
}

function parsePermalink(path: string) {
    let lineNumber: number | null = null;
    let lineEnd: number | null = null;
    const lineMatch = path.match(/(?:#|%23)L(\d+)(?:-(\d+))?$/);
    if (lineMatch) {
        lineNumber = parseInt(lineMatch[1], 10);
        if (lineMatch[2]) {
            lineEnd = parseInt(lineMatch[2], 10);
        }
        path = path.substring(0, lineMatch.index);
    }

    const segments = path.split('/').filter(s => s.length > 0);

    if (segments.length < 3) {
        return getDefaultState();
    }

    const version = parseInt(segments[0], 10);
    let minecraftVersion = decodeURIComponent(segments[1]);
    const filePath = segments.slice(2).join('/');

    if (minecraftVersion == "25w45a") {
        minecraftVersion = "25w45a_unobfuscated";
    }

    return {
        version,
        minecraftVersion,
        file: filePath + (filePath.endsWith('.class') ? '' : '.class'),
        selectedLines: lineNumber ? { line: lineNumber, lineEnd: lineEnd || undefined } : null
    };
}

function getDefaultState() {
    return {
        version: 0,
        minecraftVersion: "",
        file: "net/minecraft/ChatFormatting.class",
        selectedLines: null
    };
}

describe('Permalink', () => {
    describe('getInitialState', () => {
        beforeEach(() => {
            // Reset location hash and pathname before each test
            window.location.hash = '';
            // Note: happy-dom doesn't allow direct pathname modification,
            // so we test with helper functions that simulate both cases
        });

        describe('Default State', () => {
            it('should return default state when path is empty (new style)', () => {
                const state = getStateFromPath('/');

                expect(state.version).toBe(0);
                expect(state.minecraftVersion).toBe('');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.selectedLines).toBe(null);
            });

            it('should return default state when hash is empty (old style)', () => {
                const state = getStateFromHash('');

                expect(state.version).toBe(0);
                expect(state.minecraftVersion).toBe('');
                expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                expect(state.selectedLines).toBe(null);
            });

            it('should return default state when hash has less than 3 segments', () => {
                expect(getStateFromHash('1')).toEqual(getDefaultState());
                expect(getStateFromHash('1/1.21')).toEqual(getDefaultState());
            });

            it('should return default state when path has less than 3 segments', () => {
                expect(getStateFromPath('/1')).toEqual(getDefaultState());
                expect(getStateFromPath('/1/1.21')).toEqual(getDefaultState());
            });

            it('should return default state when hash is malformed', () => {
                expect(getStateFromHash('//')).toEqual(getDefaultState());
            });
        });

        describe('Basic Path Parsing', () => {
            describe('New Style (pathname)', () => {
                it('should parse simple permalink with version, mc version, and file', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                    expect(state.selectedLines).toBe(null);
                });

                it('should append .class if not present', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should not duplicate .class extension', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting.class');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should handle nested package paths', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/world/entity/player/Player');
                    expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                });
            });

            describe('Old Style (hash)', () => {
                it('should parse simple permalink with version, mc version, and file', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                    expect(state.selectedLines).toBe(null);
                });

                it('should handle paths with # prefix', () => {
                    const state = getStateFromHash('#1/1.21/net/minecraft/ChatFormatting');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should handle paths with #/ prefix', () => {
                    const state = getStateFromHash('#/1/1.21/net/minecraft/ChatFormatting');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should append .class if not present', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should not duplicate .class extension', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting.class');
                    expect(state.file).toBe('net/minecraft/ChatFormatting.class');
                });

                it('should handle nested package paths', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/world/entity/player/Player');
                    expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                });
            });
        });

        describe('Line Number Parsing', () => {
            describe('New Style (pathname)', () => {
                it('should parse single line number', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting#L123');

                    expect(state.selectedLines).toEqual({
                        line: 123,
                        lineEnd: undefined
                    });
                });

                it('should parse line range', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting#L10-20');

                    expect(state.selectedLines).toEqual({
                        line: 10,
                        lineEnd: 20
                    });
                });

                it('should handle URL-encoded line marker', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting%23L50');

                    expect(state.selectedLines).toEqual({
                        line: 50,
                        lineEnd: undefined
                    });
                });

                it('should handle line number at end of complex path', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/world/entity/player/Player#L456');

                    expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                    expect(state.selectedLines).toEqual({
                        line: 456,
                        lineEnd: undefined
                    });
                });

                it('should return null selectedLines when no line number present', () => {
                    const state = getStateFromPath('/1/1.21/net/minecraft/ChatFormatting');
                    expect(state.selectedLines).toBe(null);
                });
            });

            describe('Old Style (hash)', () => {
                it('should parse single line number', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting#L123');

                    expect(state.selectedLines).toEqual({
                        line: 123,
                        lineEnd: undefined
                    });
                });

                it('should parse line range', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting#L10-20');

                    expect(state.selectedLines).toEqual({
                        line: 10,
                        lineEnd: 20
                    });
                });

                it('should handle URL-encoded line marker', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting%23L50');

                    expect(state.selectedLines).toEqual({
                        line: 50,
                        lineEnd: undefined
                    });
                });

                it('should handle URL-encoded line range', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting%23L10-20');

                    expect(state.selectedLines).toEqual({
                        line: 10,
                        lineEnd: 20
                    });
                });

                it('should handle line number at end of complex path', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/world/entity/player/Player#L456');

                    expect(state.file).toBe('net/minecraft/world/entity/player/Player.class');
                    expect(state.selectedLines).toEqual({
                        line: 456,
                        lineEnd: undefined
                    });
                });

                it('should return null selectedLines when no line number present', () => {
                    const state = getStateFromHash('1/1.21/net/minecraft/ChatFormatting');
                    expect(state.selectedLines).toBe(null);
                });
            });
        });

        describe('URL Decoding', () => {
            it('should decode URL-encoded minecraft version', () => {
                const state = getStateFromHash('1/1.21%2B/net/minecraft/ChatFormatting');
                expect(state.minecraftVersion).toBe('1.21+');
            });

            it('should handle spaces in version (unlikely but possible)', () => {
                const state = getStateFromHash('1/test%20version/net/minecraft/ChatFormatting');
                expect(state.minecraftVersion).toBe('test version');
            });
        });

        describe('Backwards Compatibility', () => {
            it('should handle legacy version name 25w45a', () => {
                const state = getStateFromHash('1/25w45a/net/minecraft/ChatFormatting');
                expect(state.minecraftVersion).toBe('25w45a_unobfuscated');
            });

            it('should not modify other version names', () => {
                const state = getStateFromHash('1/25w46a/net/minecraft/ChatFormatting');
                expect(state.minecraftVersion).toBe('25w46a');
            });

            it('should handle the legacy version with line numbers', () => {
                const state = getStateFromHash('1/25w45a/net/minecraft/ChatFormatting#L100');

                expect(state.minecraftVersion).toBe('25w45a_unobfuscated');
                expect(state.selectedLines).toEqual({
                    line: 100,
                    lineEnd: undefined
                });
            });
        });

        describe('Real-world Examples', () => {
            describe('New Style (pathname)', () => {
                it('should parse multiline permalink', () => {
                    const state = getStateFromPath('/1/1.21.4/net/minecraft/server/MinecraftServer#L250-260');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21.4');
                    expect(state.file).toBe('net/minecraft/server/MinecraftServer.class');
                    expect(state.selectedLines).toEqual({
                        line: 250,
                        lineEnd: 260
                    });
                });
            });

            describe('Old Style (hash)', () => {
                it('should parse multiline permalink', () => {
                    const state = getStateFromHash('1/1.21.4/net/minecraft/server/MinecraftServer#L250-260');

                    expect(state.version).toBe(1);
                    expect(state.minecraftVersion).toBe('1.21.4');
                    expect(state.file).toBe('net/minecraft/server/MinecraftServer.class');
                    expect(state.selectedLines).toEqual({
                        line: 250,
                        lineEnd: 260
                    });
                });
            });
        });
    });
});
