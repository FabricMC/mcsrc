import { Button, Divider, Empty, Flex, Select, Tooltip } from "antd";
import type { ButtonProps } from "antd";
import { EyeInvisibleOutlined, EyeOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
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
    const [query, setQuery] = useState("");
    const calculateHeight = () => Math.min(420, window.innerHeight - 55);
    const [height, setHeight] = useState(calculateHeight());
    useEffect(() => {
        const handleResize = () => setHeight(calculateHeight());
        window.addEventListener('resize', handleResize);

        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const favoriteSet = useMemo(() => new Set(favoriteVersions), [favoriteVersions]);
    const filteredVersions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        const visibleVersions = versions
            ?.filter(v => showSnapshots || v.type === "release" || favoriteSet.has(v.id))
            .filter(v => v.id.toLowerCase().includes(normalizedQuery)) ?? [];

        const sorted = [...visibleVersions].sort((a, b) => {
            const favoriteSort = Number(favoriteSet.has(b.id)) - Number(favoriteSet.has(a.id));
            return favoriteSort || versions!.indexOf(a) - versions!.indexOf(b);
        }).map(v => v.id);
        const dividerIndex = sorted.findIndex(version => !favoriteSet.has(version));
        if (dividerIndex > 0) {
            sorted.splice(dividerIndex, 0, "divider");
        }
        return sorted;
    }, [favoriteSet, query, showSnapshots, versions]);

    const toggleFavorite = (version: string) => {
        favoriteMinecraftVersions.value = favoriteVersions.includes(version)
            ? favoriteVersions.filter(v => v !== version)
            : [...favoriteVersions, version];
    };

    const selectVersion = (version: string) => {
        console.log(`Selected Minecraft version: ${version}`);
        selectedVersion.next(version);
    };

    return (
        <Select
            aria-label="Select Minecraft version"
            value={currentVersion}
            onChange={selectVersion}
            popupMatchSelectWidth={300}
            showSearch={{ filterOption: false, onSearch: setQuery, autoClearSearchValue: true }}
            size={size}
            style={{ minWidth: minWidth }}
            listHeight={height}
            notFoundContent={<Empty description="No versions found" image={Empty.PRESENTED_IMAGE_SIMPLE} />}

            // before any click: no inputmode
            // first click: inputmode=none (no virtual keyboard)
            // any click after: inputmode=search (with virtual keyboard)
            // lose focus: remove inputmode
            onMouseDown={(e) => {
                if (e.target instanceof HTMLInputElement) {
                    const newValue = e.target.hasAttribute('inputmode') ? 'search' : 'none';
                    e.target.setAttribute('inputmode', newValue);
                }
            }}
            onBlur={(e) => e.target.removeAttribute('inputmode')}

            popupRender={(menu) => (
                <>
                    {menu}
                    <Tooltip title={showSnapshots ? "Hide snapshots" : "Show snapshots"}>
                        <Button
                            aria-label={showSnapshots ? "Hide snapshots" : "Show snapshots"}
                            aria-pressed={showSnapshots}
                            icon={showSnapshots ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                            style={{ position: "absolute", top: 12, right: 12 }}
                            onClick={() => {
                                showSnapshotVersions.value = !showSnapshotVersions.value;
                            }}
                        />
                    </Tooltip>
                </>
            )}
            options={filteredVersions.map(version =>
                version !== "divider"
                    ? { value: version }
                    : { value: "divider", disabled: true, style: { height: 10, minHeight: 10, padding: 0, cursor: "default" } }
            )}
            optionRender={(option) => {
                const version = option.data.value;
                if (version == "divider") {
                    return (
                        <Divider style={{ margin: "4.5px 4px" }} />
                    );
                }
                const favorite = favoriteSet.has(version);
                return (
                    <Flex>
                        <Tooltip title={favorite ? "Remove favorite" : "Favorite version"}>
                            <Button
                                aria-label={favorite ? `Remove ${version} from favorites` : `Favorite ${version}`}
                                icon={favorite ? <StarFilled /> : <StarOutlined />}
                                shape="circle"
                                size="small"
                                style={{ color: (favorite ? "var(--ant-color-warning)" : "inherit"), marginLeft: -4, marginRight: 4 }}
                                type="text"
                                onClick={event => {
                                    event.stopPropagation();
                                    toggleFavorite(version);
                                }}
                            />
                        </Tooltip>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {version}
                        </span>
                    </Flex>
                );
            }}
        />
    );
}

export default VersionSelector;
