import { describe, it, expect } from "vitest";
import { getDefaultVersion } from "./VersionSelection";

describe("getDefaultVersion", () => {
    it("does not select a version when none is selected", () => {
        const versions = [
            { id: "1.21.8", type: "release" },
            { id: "26.2", type: "snapshot" },
        ];

        expect(getDefaultVersion("", versions)).toBeUndefined();
    });

    it("does not replace a valid selected version", () => {
        const versions = [
            { id: "1.21.8", type: "release" },
            { id: "26.2", type: "snapshot" },
        ];

        expect(getDefaultVersion("1.21.8", versions)).toBeUndefined();
    });

    it("defaults an invalid version to the latest release", () => {
        const versions = [
            { id: "1.21.8", type: "release" },
            { id: "26.2", type: "snapshot" },
        ];

        expect(getDefaultVersion("1.20.1", versions)).toBe("1.21.8");
    });

    it("does not select a version when the version list is empty", () => {
        expect(getDefaultVersion("", [])).toBeUndefined();
    });

});