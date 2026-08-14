export const DEFAULT_VERSION = "1.12.0";
export type Version = "1.11.2" | "1.12.0";

export function getVersionFromPermalink(permalinkVersion: number): Version {
    switch (permalinkVersion) {
        case 1:
            return "1.11.2";
        case 2:
            return "1.12.0";
        default:
            return DEFAULT_VERSION;
    }
}

export function vineflowerVersionToPermalinkVersion(vineflowerVersion: Version): number {
    switch (vineflowerVersion) {
        case "1.11.2":
            return 1;
        case "1.12.0":
            return 2;
    }
}