import { Button, Divider, Empty, Flex, Input, Popover, Tooltip } from "antd";
import type { ButtonProps } from "antd";
import { DownOutlined, EyeInvisibleOutlined, EyeOutlined, SearchOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { Fragment, useMemo, useState } from "react";
import type { BehaviorSubject } from "rxjs";
import { minecraftVersions } from "../logic/MinecraftApi";
import { selectedMinecraftVersion } from "../logic/State";
import { useObservable } from "../utils/UseObservable";
import { favoriteMinecraftVersions, showSnapshotVersions } from "../logic/Settings";

const EMPTY_FAVORITE_VERSIONS: string[] = [];

interface VersionSelectorProps {
    selectedVersion?: BehaviorSubject<string | null>;
    minWidth?: number;
    size?: ButtonProps["size"];
}

function VersionSelector({
    selectedVersion = selectedMinecraftVersion,
    minWidth = 128,
    size,
}: VersionSelectorProps) {
    const versions = useObservable(minecraftVersions);
    const currentVersion = useObservable(selectedVersion);
    const favoriteVersions = useObservable(favoriteMinecraftVersions.observable) ?? EMPTY_FAVORITE_VERSIONS;
    const showSnapshots = useObservable(showSnapshotVersions.observable) ?? true;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");

    const favoriteSet = useMemo(() => new Set(favoriteVersions), [favoriteVersions]);
    const filteredVersions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const visibleVersions = versions
            ?.filter(v => showSnapshots || v.type === "release" || favoriteSet.has(v.id))
            .filter(v => v.id.toLowerCase().includes(normalizedQuery)) ?? [];

        return [...visibleVersions].sort((a, b) => {
            const favoriteSort = Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
            return favoriteSort || versions!.indexOf(a) - versions!.indexOf(b);
        });
    }, [favoriteSet, query, showSnapshots, versions]);
    const dividerIndex = filteredVersions.findIndex(version => !favoriteSet.has(version.id));
    const showFavoritesDivider = dividerIndex > 0;

    const selectedVersionId = currentVersion || versions?.[0]?.id;

    const toggleFavorite = (version: string) => {
        favoriteMinecraftVersions.value = favoriteVersions.includes(version)
            ? favoriteVersions.filter(v => v !== version)
            : [...favoriteVersions, version];
    };

    const selectVersion = (version: string) => {
        console.log(`Selected Minecraft version: ${version}`);
        selectedVersion.next(version);
        setOpen(false);
    };

    const content = (
        <Flex vertical gap={8} style={{ width: "min(320px, calc(100vw - 32px))" }}>
            <Flex gap={6}>
                <Input
                    allowClear
                    autoFocus
                    aria-label="Search Minecraft versions"
                    placeholder="Search versions"
                    prefix={<SearchOutlined />}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                />
                <Tooltip title={showSnapshots ? "Hide snapshots" : "Show snapshots"}>
                    <Button
                        aria-label={showSnapshots ? "Hide snapshots" : "Show snapshots"}
                        aria-pressed={showSnapshots}
                        icon={showSnapshots ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                        onClick={() => {
                            showSnapshotVersions.value = !showSnapshotVersions.value;
                        }}
                    />
                </Tooltip>
            </Flex>
            <div className="version-popover-list" role="listbox" aria-label="Minecraft versions">
                {filteredVersions.length > 0 ? filteredVersions.map((version, index) => {
                    const favorite = favoriteSet.has(version.id);
                    const selected = version.id === selectedVersionId;

                    return (
                        <Fragment key={version.id}>
                            {showFavoritesDivider && index === dividerIndex && <Divider style={{ margin: "6px 4px" }} />}
                            <Flex
                                align="center"
                                className={`version-popover-row${selected ? " version-popover-row-selected" : ""}`}
                                gap={8}
                                role="option"
                                aria-selected={selected}
                                onClick={() => selectVersion(version.id)}
                            >
                                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {version.id}
                                </span>
                                <Tooltip title={favorite ? "Remove favorite" : "Favorite version"}>
                                    <Button
                                        aria-label={favorite ? `Remove ${version.id} from favorites` : `Favorite ${version.id}`}
                                        icon={favorite ? <StarFilled /> : <StarOutlined />}
                                        shape="circle"
                                        size="small"
                                        style={favorite ? { color: "var(--ant-color-warning)" } : undefined}
                                        type="text"
                                        onClick={event => {
                                            event.stopPropagation();
                                            toggleFavorite(version.id);
                                        }}
                                    />
                                </Tooltip>
                            </Flex>
                        </Fragment>
                    );
                }) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No versions found" />
                )}
            </div>
        </Flex>
    );

    return (
        <Popover
            align={{ offset: [12, 0] }}
            arrow={false}
            content={content}
            open={open}
            placement="bottom"
            trigger="click"
            onOpenChange={setOpen}
        >
            <Button size={size} style={{ minWidth, justifyContent: "space-between" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{selectedVersionId}</span>
                <DownOutlined />
            </Button>
        </Popover>
    );
}

export default VersionSelector;
