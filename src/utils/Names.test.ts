import { describe, expect, it } from "vitest";
import { outerClassName, toClassName } from "./Names";

describe("outerClassName", () => {
    it.each([
        { name: "a/Owner", outer: "a/Owner" },
        { name: "a/Owner$Inner$Nested", outer: "a/Owner" },
        { name: "a/$Proxy", outer: "a/$Proxy" },
        { name: "a/$Proxy$Inner", outer: "a/$Proxy" },
        { name: "$Proxy", outer: "$Proxy" },
        { name: "$Proxy$Inner", outer: "$Proxy" },
    ])("finds the outer class of $name", ({ name, outer }) => {
        expect(outerClassName(toClassName(name))).toBe(outer);
    });
});
