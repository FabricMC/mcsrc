export interface Version {
    id: string;
    type: string;
}

export function getDefaultVersion(
    currentVersion: string | null,
    versions: Version[]
): string | undefined {
    // Don't automatically select a version on the initial visit.
    if (currentVersion === "" || versions.length === 0) {
        return undefined;
    }

    if (versions.some(v => v.id === currentVersion)) {
        return undefined;
    }

    // Select the latest stable release if the selected version is no longer available.
    const latestRelease = versions.find(v => v.type === "release");
    return latestRelease ? latestRelease.id : versions[0].id;
}
