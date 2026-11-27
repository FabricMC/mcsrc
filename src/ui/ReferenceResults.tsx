import { Button, Flex, Typography } from "antd";
import { useState } from "react";
import { combineLatest, map } from "rxjs";
import { goToReference, referenceResults, type ReferenceMatch } from "../logic/FindAllReferences";
import { hierarchyNavigation } from "../logic/Inheritance";
import { openCodeTab } from "../logic/tabs";
import { formatDescriptor, parseFieldDescriptor, parseMethodDescriptor, simpleTypeName } from "../utils/JavaDescriptors";
import { toClassFilePath, toClassName, type ClassName } from "../utils/Names";
import { useObservable } from "../utils/UseObservable";
import type { ReferenceKey, ReferenceString } from "../workers/jar-index/types";
import { ClassDataIcon, JavaIcon } from "./intellij-icons";

const rowStyle = {
    justifyContent: "flex-start",
    textAlign: "left",
    fontSize: 12
} as const;

const singleLineStyle = { overflow: "hidden", whiteSpace: "nowrap" } as const;

function getReferenceLabel(reference: ReferenceString, simpleName: string) {
    const [, , name, descriptor] = reference.split(":");

    if (reference.startsWith("m:")) {
        const { parameterTypes, returnType } = parseMethodDescriptor(descriptor);
        const parameters = parameterTypes.map(simpleTypeName).join(", ");
        const isConstructor = name === "<init>";
        return {
            label: isConstructor ? simpleName : name,
            signature: isConstructor ? `(${parameters})` : `(${parameters}) → ${simpleTypeName(returnType)}`,
            title: `${name}${formatDescriptor(descriptor)}`
        };
    }

    if (reference.startsWith("f:")) {
        const fieldType = parseFieldDescriptor(descriptor);
        return {
            label: name,
            signature: `: ${simpleTypeName(fieldType)}`,
            title: `${name}: ${fieldType}`
        };
    }

    return { label: "Class declaration", title: simpleName };
}

const groupedResults = combineLatest([referenceResults, hierarchyNavigation]).pipe(
    map(([results, navigation]) => {
        const groups = new Map<ClassName, ReferenceMatch[]>();

        for (const match of results) {
            const [, owner] = match.reference.split(":");
            const className = toClassName(owner);
            const references = groups.get(className);

            if (references) {
                references.push(match);
            } else {
                groups.set(className, [match]);
            }
        }

        return Array.from(groups, ([className, references]) => {
            const packageEnd = className.lastIndexOf("/");
            const simpleName = className.slice(packageEnd + 1);
            const packageName = packageEnd < 0 ? "" : className.slice(0, packageEnd).replaceAll("/", ".");

            return {
                className,
                simpleName,
                packageName,
                classData: navigation?.index.getClassData(className),
                references: references.map(match => ({ ...match, ...getReferenceLabel(match.reference, simpleName) })),
            };
        });
    })
);

const ReferenceResults = ({ query }: { query: ReferenceKey }) => {
    const [selectedReference, setSelectedReference] = useState<ReferenceString>();
    const groups = useObservable(groupedResults) ?? [];

    return (
        <Flex vertical gap="small">
            {groups.map(({ className, simpleName, packageName, classData, references }) => (
                <section key={className} aria-label={className}>
                    <Button
                        block
                        size="small"
                        color="default"
                        variant="filled"
                        icon={classData
                            ? <ClassDataIcon data={classData} aria-hidden style={{ fontSize: 16 }} />
                            : <JavaIcon aria-hidden style={{ fontSize: 16 }} />}
                        title={className}
                        style={rowStyle}
                        onClick={() => openCodeTab(toClassFilePath(className))}
                    >
                        <span style={{ ...singleLineStyle, textOverflow: "ellipsis" }}>
                            <strong style={{ fontSize: 13 }}>{simpleName}</strong>
                            {packageName && (
                                <Typography.Text type="secondary" style={{ marginInlineStart: 8, fontSize: "inherit" }}>
                                    {packageName}
                                </Typography.Text>
                            )}
                        </span>
                    </Button>
                    <div style={{ paddingInlineStart: 12 }}>
                        {references.map(({ reference, queries, label, signature, title }) => {
                            const selected = reference === selectedReference;

                            return (
                                <Button
                                    key={reference}
                                    block
                                    size="small"
                                    color={selected ? "primary" : "default"}
                                    variant={selected ? "filled" : "text"}
                                    title={title}
                                    aria-current={selected ? "location" : undefined}
                                    style={rowStyle}
                                    onClick={() => {
                                        setSelectedReference(reference);
                                        goToReference(query, reference, queries);
                                    }}
                                >
                                    <span style={singleLineStyle}>
                                        <strong>{label}</strong>
                                        {signature && <Typography.Text type="secondary" style={{ fontSize: "inherit" }}>{signature}</Typography.Text>}
                                    </span>
                                </Button>
                            );
                        })}
                    </div>
                </section>
            ))}
        </Flex>
    );
};

export default ReferenceResults;
