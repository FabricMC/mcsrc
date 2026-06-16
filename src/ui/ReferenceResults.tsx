import { useObservable } from "../utils/UseObservable";
import { formatReference, goToReference, referenceResults } from "../logic/FindAllReferences";
import { map, Observable } from "rxjs";
import { openCodeTab } from "../logic/tabs";
import { referencesQuery } from "../logic/State";
import type { ReferenceString } from "../workers/jar-index/types";
import { theme } from "antd";
import { toClassFilePath, toClassName, type ClassName } from "../utils/Names";

function getUsageClass(usage: ReferenceString): ClassName {
    if (usage.startsWith("m:") || usage.startsWith("f:")) {
        const parts = usage.slice(2).split(":");
        return toClassName(parts[0]);
    }

    // class usage
    return toClassName(usage.slice(2));
}

interface ReferenceGroup {
    className: ClassName;
    references: ReferenceString[];
}

const groupedResults: Observable<ReferenceGroup[]> = referenceResults.pipe(
    map(results => {
        const groups = new Map<ClassName, ReferenceString[]>();

        for (const usage of results) {
            const className = getUsageClass(usage);
            const references = groups.get(className) || [];
            references.push(usage);
            groups.set(className, references);
        }

        return Array.from(groups.entries()).map(([className, references]) => ({
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
    const { token } = theme.useToken();

    return (
        <div style={{ marginBottom: "4px" }}>
            <div
                onClick={() => openCodeTab(toClassFilePath(group.className))}
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
                        onClick={() => {
                            if (query) goToReference(query, reference);
                        }}
                        style={{
                            cursor: "pointer",
                            fontSize: "12px",
                            transition: "background-color 0.2s",
                            color: token.colorTextSecondary
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
