import { Dropdown } from "antd";
import type { ReactElement } from "react";
import type { VersionListEntry } from "../logic/MinecraftApi";
import { getVersionComparisons, type VersionComparison } from "../logic/VersionComparisons";

interface VersionComparisonMenuProps {
    versions: VersionListEntry[];
    onSelect: (comparison: VersionComparison) => void;
    children: ReactElement;
}

export default function VersionComparisonMenu({ versions, onSelect, children }: VersionComparisonMenuProps) {
    const comparisons = getVersionComparisons(versions);

    return (
        <Dropdown
            disabled={comparisons.length === 0}
            trigger={["contextMenu"]}
            menu={{
                items: comparisons.map(({ key, label }) => ({ key, label })),
                onClick: ({ key }) => {
                    const comparison = comparisons.find(item => item.key === key);
                    if (comparison) {
                        onSelect(comparison);
                    }
                },
            }}
        >
            {children}
        </Dropdown>
    );
}
