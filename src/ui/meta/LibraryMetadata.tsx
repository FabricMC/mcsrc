import { Flex, Typography, theme } from "antd";
import type { ComponentProps } from "react";
import { compareLibraryVersion, libraryVersions, type LibraryVersionChange, type MetadataRow } from "../../logic/LauncherMeta";
import type { Json, Manifest } from "../../logic/MinecraftApi";
import MetadataValue from "./MetadataValue";
import JsonBlock from "./JsonBlock";

const highlightTypes: Record<LibraryVersionChange | MetadataRow["status"], ComponentProps<typeof Typography.Text>["type"]> = {
    major: "danger",
    minor: "warning",
    patch: undefined,
    qualifier: "secondary",
    revision: "secondary",
    version: "warning",
    added: "success",
    removed: "danger",
    changed: "warning",
    unchanged: undefined,
};

export function LibrarySummary({ value, other, status }: { value: Json | undefined; other?: Json; status: MetadataRow["status"] }) {
    const { token } = theme.useToken();
    const versions = libraryVersions(value);
    const otherVersions = libraryVersions(other);
    if (!versions.length) {
        return <MetadataValue value={undefined} />;
    }
    const comparedVersion = versions.length === 1 && otherVersions.length === 1 ? otherVersions[0] : undefined;
    return (
        <Flex vertical gap="small">
            {versions.map(version => {
                const changeKind = compareLibraryVersion(version, comparedVersion);
                const unmatchedVersion = otherVersions.length > 0
                    && !otherVersions.includes(version) && comparedVersion === undefined;
                const highlighted = changeKind !== null || status === "added" || status === "removed" || unmatchedVersion;
                const highlight = changeKind ?? status;
                return (
                    <Typography.Text
                        code
                        strong={highlighted}
                        type={highlighted ? highlightTypes[highlight] : undefined}
                        style={highlighted && highlight === "patch" ? { color: token.colorInfo } : undefined}
                        key={version}
                    >
                        {version}
                    </Typography.Text>
                );
            })}
        </Flex>
    );
}

export function LibraryDetails({ value }: { value: Json | undefined }) {
    const entries = Array.isArray(value)
        ? value.filter((entry): entry is Manifest => entry !== null && typeof entry === "object" && !Array.isArray(entry))
        : [];
    if (!entries.length) {
        return <MetadataValue value={undefined} />;
    }
    return (
        <Flex vertical gap="middle">
            {entries.map((entry, index) => {
                const classifier = String(entry.name).split(":").slice(3).join(":");
                return (
                    <Flex vertical gap="small" key={index}>
                        <Typography.Text strong>{classifier || "Main"}</Typography.Text>
                        <JsonBlock value={entry} />
                    </Flex>
                );
            })}
        </Flex>
    );
}
