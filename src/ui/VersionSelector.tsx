import { Button, Divider, Empty, Flex, Select, Tooltip } from "antd";
import type { ButtonProps } from "antd";
import { DownOutlined, EyeInvisibleOutlined, EyeOutlined, StarFilled, StarOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
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
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const openRef = useRef(open);
    openRef.current = open;
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
        if (!versions) return [];

        const normalizedQuery = query.trim().toLowerCase();
        const visibleVersions = versions
            .filter(v => showSnapshots || v.type === "release" || favoriteSet.has(v.id))
            .map(v => v.id)
            .filter(id => id.toLowerCase().includes(normalizedQuery))
            .sort((a, b) => {
                const exactMatch = Number(b === normalizedQuery) - Number(a === normalizedQuery);
                if (exactMatch) return exactMatch;
                return Number(favoriteSet.has(b)) - Number(favoriteSet.has(a));
            });
        const dividerIndex = visibleVersions.findIndex(version => !favoriteSet.has(version));
        if (dividerIndex > 0) {
            visibleVersions.splice(dividerIndex, 0, "divider");
        }
        return visibleVersions;
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

    const inputElement = useMemo(() => ((props: any) =>
        <input
            {...props}
            inputMode="none"
            ref={inputRef}
            onMouseDown={() => {
                if (openRef.current) {
                    inputRef.current?.setAttribute('inputmode', 'search');
                }
            }}
            onBlur={() => {
                inputRef.current?.setAttribute('inputmode', 'none');
            }}
        />
    ), []);

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
            open={open}
            onOpenChange={setOpen}
            notFoundContent={<Empty description="No versions found" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
            suffix={<DownOutlined onMouseDown={() => { if (open) setOpen(false); }} style={{ cursor: "pointer" }} />}
            onMouseDown={(e) => e.stopPropagation()}
            components={{ input: inputElement }}
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
