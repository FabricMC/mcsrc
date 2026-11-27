import { describe, expect, it } from "vitest";
import type { VersionListEntry } from "./MinecraftApi";
import { getVersionComparisons } from "./VersionComparisons";

function version(id: string, type: string): VersionListEntry {
    return { id, type, url: "", time: "", releaseTime: "", sha1: "" };
}

describe("getVersionComparisons", () => {
    it("offers current snapshot and release comparisons", () => {
        const versions = [
            version("snapshot-2", "snapshot"),
            version("snapshot-1", "snapshot"),
            version("release-2", "release"),
            version("old-snapshot", "snapshot"),
            version("release-1", "release"),
        ];

        expect(getVersionComparisons(versions)).toEqual([
            { key: "snapshot-release", label: "Compare latest snapshot with last release", left: "release-2", right: "snapshot-2" },
            { key: "snapshots", label: "Compare last two snapshots", left: "snapshot-1", right: "snapshot-2" },
            { key: "releases", label: "Compare last two releases", left: "release-1", right: "release-2" },
        ]);
    });

    it("only offers release comparisons when there are no current snapshots", () => {
        const versions = [
            version("release-2", "release"),
            version("old-snapshot", "snapshot"),
            version("release-1", "release"),
        ];

        expect(getVersionComparisons(versions)).toEqual([
            { key: "releases", label: "Compare last two releases", left: "release-1", right: "release-2" },
        ]);
    });

    it("offers snapshot comparisons when no release is available", () => {
        const versions = [version("snapshot-2", "snapshot"), version("snapshot-1", "snapshot")];

        expect(getVersionComparisons(versions)).toEqual([
            { key: "snapshots", label: "Compare last two snapshots", left: "snapshot-1", right: "snapshot-2" },
        ]);
    });
});
