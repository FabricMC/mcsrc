import { useObservable } from "../utils/UseObservable";
import { formatUsage, goToUsage, usageQuery, useageResults } from "../logic/FindUsages";
import type { UsageString } from "../workers/UsageIndex";
import { map, Observable } from "rxjs";
import { openTab } from "../logic/Tabs";

function getUsageClass(usage: UsageString): string {
    if (usage.startsWith("m:") || usage.startsWith("f:")) {
        const parts = usage.slice(2).split(":");
        return parts[0];
    }

    // class usage
    return usage;
}

interface UsageGroup {
    className: string;
    usages: UsageString[];
}

const groupedResults: Observable<UsageGroup[]> = useageResults.pipe(
    map(results => {
        const groups: Record<string, UsageString[]> = {};

        for (const usage of results) {
            const className = getUsageClass(usage);
            if (!groups[className]) {
                groups[className] = [];
            }
            groups[className].push(usage);
        }

        return Object.entries(groups).map(([className, usages]) => ({
            className,
            usages
        }));
    })
);

interface UsageGroupItemProps {
    group: UsageGroup;
}

const UsageGroupItem = ({ group }: UsageGroupItemProps) => {
    const query = useObservable(usageQuery)!;

    return (
        <div style={{ marginBottom: "4px" }}>
            <div
                onClick={() => openTab(group.className)}
                style={{
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "bold",
                    transition: "background-color 0.2s",
                    borderRadius: "4px"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
                {group.className}
            </div>
            <div style={{ paddingLeft: "16px" }}>
                {group.usages.map((usage, index) => (
                    <div
                        key={index}
                        onClick={() => goToUsage(query, usage)}
                        style={{
                            cursor: "pointer",
                            fontSize: "12px",
                            transition: "background-color 0.2s",
                            color: "rgba(255, 255, 255, 0.7)"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {formatUsage(usage)}
                    </div>
                ))}
            </div>
        </div>
    );
};

const UsageResults = () => {
    const results = useObservable(groupedResults) || [];

    return (
        <div style={{ padding: "8px" }}>
            {results.map((group, index) => (
                <UsageGroupItem key={index} group={group} />
            ))}
        </div>
    );
};

export default UsageResults;