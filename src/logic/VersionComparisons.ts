import type { VersionListEntry } from "./MinecraftApi";

export interface VersionComparison {
    key: string;
    label: string;
    left: string;
    right: string;
}

export function getVersionComparisons(versions: VersionListEntry[]): VersionComparison[] {
    const latestReleaseIndex = versions.findIndex(version => version.type === "release");
    const releases = versions.filter(version => version.type === "release");
    const recentVersions = latestReleaseIndex < 0 ? versions : versions.slice(0, latestReleaseIndex);
    const snapshots = recentVersions.filter(version => version.type === "snapshot");
    const comparisons: VersionComparison[] = [];

    if (snapshots.length > 0 && releases.length > 0) {
        comparisons.push({
            key: "snapshot-release",
            label: "Compare latest snapshot with last release",
            left: releases[0].id,
            right: snapshots[0].id,
        });
    }
    if (snapshots.length > 1) {
        comparisons.push({
            key: "snapshots",
            label: "Compare last two snapshots",
            left: snapshots[1].id,
            right: snapshots[0].id,
        });
    }
    if (releases.length > 1) {
        comparisons.push({
            key: "releases",
            label: "Compare last two releases",
            left: releases[1].id,
            right: releases[0].id,
        });
    }

    return comparisons;
}
