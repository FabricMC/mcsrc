import { useObservable } from "../utils/UseObservable";
import { formatReference, goToReference, referenceResults } from "../logic/FindAllReferences";
import type { ReferenceString } from "../workers/JarIndex";
import { map, Observable } from "rxjs";
import { openTab } from "../logic/Tabs";
import { referencesQuery } from "../logic/State";

function getUsageClass(usage: ReferenceString): string {
    if (usage.startsWith("m:") || usage.startsWith("f:")) {
        const parts = usage.slice(2).split(":");
        return parts[0];
    }

    // class usage
    return usage;
}

interface ReferenceGroup {
    className: string;
    references: ReferenceString[];
}

const groupedResults: Observable<ReferenceGroup[]> = referenceResults.pipe(
    map(results => {
        const groups: Record<string, ReferenceString[]> = {};

        for (const usage of results) {
            const className = getUsageClass(usage);
            if (!groups[className]) {
                groups[className] = [];
            }
            groups[className].push(usage);
        }

        return Object.entries(groups).map(([className, references]) => ({
            className,
            references
        }));
    })
);

interface UsageGroupItemProps {
    group: ReferenceGroup;
}

const UsageGroupItem = ({ group }: UsageGroupItemProps) => {
    const query = useObservable(referencesQuery)!;

    return (
        <div style={{ marginBottom: "4px" }}>
            <div
                onClick={() => openTab(group.className + ".class")}
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
                {group.references.map((reference, index) => (
                    <div
                        key={index}
                        onClick={() => goToReference(query, reference)}
                        style={{
                            cursor: "pointer",
                            fontSize: "12px",
                            transition: "background-color 0.2s",
                            color: "rgba(255, 255, 255, 0.7)"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {formatReference(reference)}
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