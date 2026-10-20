import { describe, it, expect } from 'vitest';
import { performSearch, getCamelCaseAcronym, matchesCamelCase } from './Search';

describe('Search Algorithm', () => {

    describe('Exact Match', () => {
        it('should prioritize exact matches', () => {
            const classes = [
                'com/example/Player',
                'com/example/PlayerEntity',
                'com/example/MultiPlayer',
            ];
            const results = performSearch('player', classes);
            expect(results[0]).toBe('com/example/Player');
        });
    });

    describe('Starts With', () => {
        it('should prioritize starts-with matches', () => {
            const classes = [
                'com/example/EntityPlayer',
                'com/example/Player',
                'com/example/PlayerEntity',
            ];
            const results = performSearch('player', classes);
            expect(results[0]).toBe('com/example/Player');
            expect(results[1]).toBe('com/example/PlayerEntity');
        });
    });

    describe('CamelCase Matching', () => {
        it('should match prefixes of consecutive CamelCase words', () => {
            const classes = ['com/example/DataComponents'];

            expect(performSearch('DComp', classes)).toEqual(classes);
            expect(performSearch('DaCo', classes)).toEqual(classes);
            expect(performSearch('DataComp', classes)).toEqual(classes);
        });

        it('should require matching case for CamelCase word prefixes', () => {
            const classes = ['com/example/DataComponents'];

            expect(performSearch('dcomp', classes)).toEqual([]);
            expect(performSearch('Dcomp', classes)).toEqual([]);
            expect(performSearch('dComp', classes)).toEqual([]);
        });

        it('should not skip or reorder CamelCase words', () => {
            const classes = ['com/example/BlockEntityRenderProvider'];

            expect(performSearch('BEntRen', classes)).toEqual(classes);
            expect(performSearch('BEntPro', classes)).toEqual([]);
            expect(performSearch('EntB', classes)).toEqual([]);
        });

        it('should rank word prefixes below name prefixes and above substrings', () => {
            const classes = [
                'com/example/SomeDComp',
                'com/example/DataComponents',
                'com/example/DComponent',
                'com/example/DComp',
            ];

            expect(performSearch('DComp', classes)).toEqual([
                'com/example/DComp',
                'com/example/DComponent',
                'com/example/DataComponents',
                'com/example/SomeDComp',
            ]);
        });

        it('should match CamelCase acronyms', () => {
            const classes = [
                'net/minecraft/server/MinecraftServer',
                'net/minecraft/util/MathHelper',
            ];
            const results = performSearch('ms', classes);
            expect(results).toContain('net/minecraft/server/MinecraftServer');
        });

        it('should prioritize exact CamelCase acronym matches', () => {
            const classes = [
                'net/minecraft/client/renderer/RenderType',
                'net/minecraft/world/entity/player/Player',
            ];
            const results = performSearch('rt', classes);
            expect(results[0]).toBe('net/minecraft/client/renderer/RenderType');
        });

        it('should match partial CamelCase acronyms', () => {
            const classes = [
                'net/minecraft/world/entity/player/Player',
                'net/minecraft/core/BlockPos',
                'net/minecraft/world/item/ItemStack',
            ];
            const results = performSearch('bp', classes);
            expect(results).toContain('net/minecraft/core/BlockPos');
        });
    });

    describe('Contains Match', () => {
        it('should find classes containing the query', () => {
            const classes = [
                'com/example/EntityPlayer',
                'com/example/Player',
            ];
            const results = performSearch('player', classes);
            expect(results).toHaveLength(2);
            expect(results).toContain('com/example/EntityPlayer');
        });
    });

    describe('Multiple Terms', () => {
        const classes = [
            'com/example/BiomePacket',
            'com/example/PacketBiome',
            'com/example/BiomeUpdatePacket',
            'com/example/Biome',
            'com/example/Packet',
            'com/biome/PacketHandler',
        ];

        it('should require every term in the simple class name, regardless of order or case', () => {
            const expected = classes.slice(0, 3);
            expect(performSearch('BIOME packet', classes)).toEqual(expect.arrayContaining(expected));
            expect(performSearch('BIOME packet', classes)).toHaveLength(3);
            expect(performSearch('packet biome', classes)).toEqual(performSearch('biome packet', classes));
        });

        it('should ignore surrounding and repeated whitespace', () => {
            expect(performSearch('  biome \t packet  ', classes)).toEqual(performSearch('biome packet', classes));
        });

        it('should allow CamelCase matching for each term', () => {
            expect(performSearch('bup packet', classes)).toEqual(['com/example/BiomeUpdatePacket']);
        });

        it('should return no results for whitespace', () => {
            expect(performSearch('   \t ', classes)).toEqual([]);
        });
    });

    describe('Scoring Priority', () => {
        it('should order results by match quality', () => {
            const classes = [
                'com/example/EntityBlock',
                'com/example/Block',
                'com/example/BlockEntity',
                'com/example/BedrockLevel',
            ];
            const results = performSearch('block', classes);

            // Exact match first
            expect(results[0]).toBe('com/example/Block');
            // Starts with second
            expect(results[1]).toBe('com/example/BlockEntity');
            // Contains last
            expect(results[2]).toBe('com/example/EntityBlock');
        });
    });

    describe('Case Insensitivity', () => {
        it('should match regardless of case', () => {
            const classes = [
                'com/example/Player',
                'com/example/PLAYER',
                'com/example/player',
            ];

            const results1 = performSearch('player', classes);
            const results2 = performSearch('PLAYER', classes);
            const results3 = performSearch('Player', classes);

            expect(results1).toHaveLength(3);
            expect(results2).toHaveLength(3);
            expect(results3).toHaveLength(3);
        });
    });

    describe('Empty Query', () => {
        it('should return empty array for empty query', () => {
            const classes = ['com/example/Player'];
            const results = performSearch('', classes);
            expect(results).toHaveLength(0);
        });
    });

    describe('Custom Search Text', () => {
        it('should search member keys by member name', () => {
            const members = [
                'com/example/Player:getName:()Ljava/lang/String;',
                'com/example/Player:setHealth:(I)V',
                'com/example/Inventory:getItem:(I)Lcom/example/Item;',
            ];

            const results = performSearch('get', members, member => member.split(':')[1]);

            expect(results).toHaveLength(2);
            expect(results).toContain('com/example/Player:getName:()Ljava/lang/String;');
            expect(results).toContain('com/example/Inventory:getItem:(I)Lcom/example/Item;');
            expect(results).not.toContain('com/example/Player:setHealth:(I)V');
        });
    });

    describe('Result Limit', () => {
        it('should limit results to 100 items', () => {
            const classes = Array.from({ length: 200 }, (_, i) => `com/example/Class${i}`);
            const results = performSearch('class', classes);
            expect(results.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Real-world Cases', () => {
        it('should prioritize exact match "Items" over classes starting with "Item"', () => {
            const classes = [
                'net/minecraft/client/renderer/item/ItemStackRenderState',
                'net/minecraft/client/gui/ItemSlotMouseAction',
                'net/minecraft/references/Items',
                'net/minecraft/util/datafix/fixes/ItemShulkerBoxColorFix',
                'net/minecraft/util/datafix/fixes/ItemSpawnEggFix',
            ];
            const results = performSearch('Items', classes);

            // Exact match should be first
            expect(results[0]).toBe('net/minecraft/references/Items');
        });

        it('should prioritize "Items" over "Item" when searching for "Items"', () => {
            const classes = [
                'net/minecraft/world/item/Item',
                'net/minecraft/references/Items',
                'net/minecraft/world/item/Items',
            ];
            const results = performSearch('Items', classes);

            // Both exact matches "Items" should come before "Item"
            expect(results[0]).toBe('net/minecraft/references/Items');
            expect(results[1]).toBe('net/minecraft/world/item/Items');
            // "Item" should not match at all when searching for "Items"
            expect(results).not.toContain('net/minecraft/world/item/Item');
        });

        it('should prioritize shorter class names when scores are equal', () => {
            const classes = [
                'com/example/PlayerController',
                'com/example/Player',
                'com/example/PlayerEntity',
            ];
            const results = performSearch('play', classes);

            // All start with "play", but shorter name should come first
            expect(results[0]).toBe('com/example/Player');
        });
    });

    describe('Helper Functions', () => {
        describe('getCamelCaseAcronym', () => {
            it('should extract capital letters', () => {
                expect(getCamelCaseAcronym('MinecraftServer')).toBe('MS');
                expect(getCamelCaseAcronym('RenderType')).toBe('RT');
                expect(getCamelCaseAcronym('BlockPos')).toBe('BP');
            });

            it('should return empty string for no capitals', () => {
                expect(getCamelCaseAcronym('lowercase')).toBe('');
            });
        });

        describe('matchesCamelCase', () => {
            it('should match CamelCase acronyms case-insensitively', () => {
                expect(matchesCamelCase('MinecraftServer', 'ms')).toBe(true);
                expect(matchesCamelCase('MinecraftServer', 'MS')).toBe(true);
                expect(matchesCamelCase('MinecraftServer', 'M')).toBe(true);
            });

            it('should not match if acronym does not start with query', () => {
                expect(matchesCamelCase('MinecraftServer', 'sr')).toBe(false);
                expect(matchesCamelCase('MinecraftServer', 's')).toBe(false);
            });
        });
    });
});
