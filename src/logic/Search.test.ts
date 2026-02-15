import { describe, it, expect } from "vitest";

import { performSearch, getCamelCaseAcronym, matchesCamelCase } from "./Search";

describe("Search Algorithm", () => {
  describe("Exact Match", () => {
    it("should prioritize exact matches", () => {
      const classes = ["com/example/Player", "com/example/PlayerEntity", "com/example/MultiPlayer"];
      const results = performSearch("player", classes);
      expect(results[0]).toBe("com/example/Player");
    });
  });

  describe("Starts With", () => {
    it("should prioritize starts-with matches", () => {
      const classes = [
        "com/example/EntityPlayer",
        "com/example/Player",
        "com/example/PlayerEntity",
      ];
      const results = performSearch("player", classes);
      expect(results[0]).toBe("com/example/Player");
      expect(results[1]).toBe("com/example/PlayerEntity");
    });
  });

  describe("CamelCase Matching", () => {
    it("should match CamelCase acronyms", () => {
      const classes = ["net/minecraft/server/MinecraftServer", "net/minecraft/util/MathHelper"];
      const results = performSearch("ms", classes);
      expect(results).toContain("net/minecraft/server/MinecraftServer");
    });

    it("should prioritize exact CamelCase acronym matches", () => {
      const classes = [
        "net/minecraft/client/renderer/RenderType",
        "net/minecraft/world/entity/player/Player",
      ];
      const results = performSearch("rt", classes);
      expect(results[0]).toBe("net/minecraft/client/renderer/RenderType");
    });

    it("should match partial CamelCase acronyms", () => {
      const classes = [
        "net/minecraft/world/entity/player/Player",
        "net/minecraft/core/BlockPos",
        "net/minecraft/world/item/ItemStack",
      ];
      const results = performSearch("bp", classes);
      expect(results).toContain("net/minecraft/core/BlockPos");
    });
  });

  describe("Contains Match", () => {
    it("should find classes containing the query", () => {
      const classes = ["com/example/EntityPlayer", "com/example/Player"];
      const results = performSearch("player", classes);
      expect(results).toHaveLength(2);
      expect(results).toContain("com/example/EntityPlayer");
    });
  });

  describe("Scoring Priority", () => {
    it("should order results by match quality", () => {
      const classes = [
        "com/example/EntityBlock",
        "com/example/Block",
        "com/example/BlockEntity",
        "com/example/BedrockLevel",
      ];
      const results = performSearch("block", classes);

      // Exact match first
      expect(results[0]).toBe("com/example/Block");
      // Starts with second
      expect(results[1]).toBe("com/example/BlockEntity");
      // Contains last
      expect(results[2]).toBe("com/example/EntityBlock");
    });
  });

  describe("Case Insensitivity", () => {
    it("should match regardless of case", () => {
      const classes = ["com/example/Player", "com/example/PLAYER", "com/example/player"];

      const results1 = performSearch("player", classes);
      const results2 = performSearch("PLAYER", classes);
      const results3 = performSearch("Player", classes);

      expect(results1).toHaveLength(3);
      expect(results2).toHaveLength(3);
      expect(results3).toHaveLength(3);
    });
  });

  describe("Empty Query", () => {
    it("should return empty array for empty query", () => {
      const classes = ["com/example/Player"];
      const results = performSearch("", classes);
      expect(results).toHaveLength(0);
    });
  });

  describe("Result Limit", () => {
    it("should limit results to 100 items", () => {
      const classes = Array.from({ length: 200 }, (_, i) => `com/example/Class${i}`);
      const results = performSearch("class", classes);
      expect(results.length).toBeLessThanOrEqual(100);
    });
  });

  describe("Real-world Cases", () => {
    it('should prioritize exact match "Items" over classes starting with "Item"', () => {
      const classes = [
        "net/minecraft/client/renderer/item/ItemStackRenderState",
        "net/minecraft/client/gui/ItemSlotMouseAction",
        "net/minecraft/references/Items",
        "net/minecraft/util/datafix/fixes/ItemShulkerBoxColorFix",
        "net/minecraft/util/datafix/fixes/ItemSpawnEggFix",
      ];
      const results = performSearch("Items", classes);

      // Exact match should be first
      expect(results[0]).toBe("net/minecraft/references/Items");
    });

    it('should prioritize "Items" over "Item" when searching for "Items"', () => {
      const classes = [
        "net/minecraft/world/item/Item",
        "net/minecraft/references/Items",
        "net/minecraft/world/item/Items",
      ];
      const results = performSearch("Items", classes);

      // Both exact matches "Items" should come before "Item"
      expect(results[0]).toBe("net/minecraft/references/Items");
      expect(results[1]).toBe("net/minecraft/world/item/Items");
      // "Item" should not match at all when searching for "Items"
      expect(results).not.toContain("net/minecraft/world/item/Item");
    });

    it("should prioritize shorter class names when scores are equal", () => {
      const classes = [
        "com/example/PlayerController",
        "com/example/Player",
        "com/example/PlayerEntity",
      ];
      const results = performSearch("play", classes);

      // All start with "play", but shorter name should come first
      expect(results[0]).toBe("com/example/Player");
    });
  });

  describe("Helper Functions", () => {
    describe("getCamelCaseAcronym", () => {
      it("should extract capital letters", () => {
        expect(getCamelCaseAcronym("MinecraftServer")).toBe("MS");
        expect(getCamelCaseAcronym("RenderType")).toBe("RT");
        expect(getCamelCaseAcronym("BlockPos")).toBe("BP");
      });

      it("should return empty string for no capitals", () => {
        expect(getCamelCaseAcronym("lowercase")).toBe("");
      });
    });

    describe("matchesCamelCase", () => {
      it("should match CamelCase acronyms case-insensitively", () => {
        expect(matchesCamelCase("MinecraftServer", "ms")).toBe(true);
        expect(matchesCamelCase("MinecraftServer", "MS")).toBe(true);
        expect(matchesCamelCase("MinecraftServer", "M")).toBe(true);
      });

      it("should not match if acronym does not start with query", () => {
        expect(matchesCamelCase("MinecraftServer", "sr")).toBe(false);
        expect(matchesCamelCase("MinecraftServer", "s")).toBe(false);
      });
    });
  });
});
