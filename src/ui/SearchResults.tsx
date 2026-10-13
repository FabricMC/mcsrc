import { Dropdown, List, message, theme } from "antd";
import type { MenuProps } from "antd";
import { searchResults, type SearchResult } from "../logic/JarFile";
import { useObservable } from "../utils/UseObservable";
import { openCodeTab, openInheritanceViewTab } from "../logic/tabs";
import { referencesQuery } from "../logic/State";
import { dottedClassNameFromClassName, outerClassFilePath, toClassFilePath, toClassName, withoutClassExtension, type ClassName } from "../utils/Names";
import { requestStringLiteralJump, requestTokenJump } from "./CodeExtensions";
import type { ReferenceKey } from "../workers/jar-index/types";
import { escapeStringLiteral } from "../logic/Search";

type MemberType = "class" | "field" | "method";

interface SearchResultToken {
    type: MemberType;
    className: ClassName;
    name?: string;
    descriptor?: string;
}

function getSearchResultToken(item: SearchResult): SearchResultToken {
    if (item.type === "classes") {
        return { type: "class", className: toClassName(item.value) };
    }

    const member = item.type === "strings" ? item.value[0] : item.value;
    if (item.type === "strings" && !member.includes(":")) {
        return { type: "class", className: toClassName(member) };
    }

    const [className, name, descriptor] = member.split(":");
    const type = {
        "strings": descriptor.startsWith("(") ? "method" : "field",
        "methods": "method",
        "fields": "field"
    }[item.type] as MemberType;
    return {
        type,
        className: toClassName(className),
        name,
        descriptor
    };
}

async function setClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    message.success("Copied to clipboard.");
}

function getMenuItems(token: SearchResultToken): MenuProps["items"] {
    const referenceKey: string = token.type === "class"
        ? token.className
        : `${token.className}:${token.name}:${token.descriptor}`;

    return [
        {
            key: "find-all-references",
            label: "Find All References",
            onClick: () => referencesQuery.next(referenceKey as ReferenceKey)
        },
        {
            key: "view-inheritance",
            label: "View Inheritance Hierarchy",
            onClick: () => openInheritanceViewTab(`hierarchy::${token.className}`)
        },
        { type: "divider" },
        {
            key: "copy-aw",
            label: "Copy Class Tweaker / Access Widener",
            onClick: () => {
                switch (token.type) {
                    case "class":
                        void setClipboard(`accessible class ${token.className}`);
                        break;
                    case "field":
                        void setClipboard(`accessible field ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                    case "method":
                        void setClipboard(`accessible method ${token.className} ${token.name} ${token.descriptor}`);
                        break;
                }
            }
        },
        {
            key: "copy-at",
            label: "Copy Access Transformer",
            onClick: () => {
                switch (token.type) {
                    case "class":
                        void setClipboard(`public ${dottedClassNameFromClassName(token.className)}`);
                        break;
                    case "field":
                        void setClipboard(`public ${dottedClassNameFromClassName(token.className)} ${token.name}`);
                        break;
                    case "method":
                        void setClipboard(`public ${dottedClassNameFromClassName(token.className)} ${token.name}${token.descriptor}`);
                        break;
                }
            }
        },
        {
            key: "copy-mixin",
            label: "Copy Mixin Target",
            onClick: () => {
                switch (token.type) {
                    case "class":
                        void setClipboard(`${token.className}`);
                        break;
                    case "field":
                        void setClipboard(`L${token.className};${token.name}:${token.descriptor}`);
                        break;
                    case "method":
                        void setClipboard(`L${token.className};${token.name}${token.descriptor}`);
                        break;
                }
            }
        },
    ];
}

function getResultClassFilePath(item: SearchResult) {
    if (item.type === "classes") {
        return item.value;
    }

    const member = item.type === "strings" ? item.value[0] : item.value;
    const className = member.includes(":") ? member.split(":")[0] : member;
    return outerClassFilePath(toClassFilePath(toClassName(className)));
}

function openSearchResult(item: SearchResult) {
    const classFilePath = getResultClassFilePath(item);

    if (item.type === "strings") {
        const [member, literal] = item.value;
        if (!member.includes(":")) {
            const className = toClassName(member);
            requestStringLiteralJump(classFilePath, "class", member, className, literal);
            openCodeTab(classFilePath);
            return;
        }

        const [className, name, descriptor] = member.split(":");
        const targetType = name === "<clinit>"
            ? "class"
            : descriptor.startsWith("(") ? "method" : "field";
        const target = targetType === "class" ? className : targetType === "method" ? `${name}:${descriptor}` : name;
        requestStringLiteralJump(classFilePath, targetType, target, toClassName(className), literal);
    } else if (item.type !== "classes") {
        const member = item.value;
        const [className, name, descriptor] = member.split(":");
        const targetType = item.type === "methods" ? "method" : "field";
        const target = targetType === "method" ? `${name}:${descriptor}` : name;
        requestTokenJump(
            classFilePath,
            targetType,
            target,
            toClassName(className)
        );
    }

    openCodeTab(classFilePath);
}

function formatSearchResult(item: SearchResult, mutedColor: string) {
    if (item.type === "classes") {
        const path = withoutClassExtension(item.value);
        const nameStart = path.lastIndexOf("/") + 1;

        return <>
            <span style={{ color: mutedColor }}>{path.slice(0, nameStart)}</span>
            {path.slice(path.lastIndexOf("/") + 1)}
        </>;
    }

    if (item.type === "strings") {
        const [member, literal] = item.value;
        const escapedLiteral = escapeStringLiteral(literal, false);
        if (!member.includes(":")) {
            const owner = member.split("/").pop() || member;
            return <div style={{ justifyContent: "start" }}>
                <span style={{ color: mutedColor }}>{owner}: </span><code>{escapedLiteral}</code>
            </div>;
        }

        const [className, memberName] = member.split(":", 2);
        const owner = className.split("/").pop() || className;
        return <div style={{ justifyContent: "start" }}>
            <span style={{ color: mutedColor }}>{owner}.{memberName}: </span><code>{escapedLiteral}</code>
        </div>;
    }

    const [className, name, descriptor] = item.value.split(":");
    const owner = className.split("/").pop() || className;

    return item.type === "methods"
        ? <>
            <span style={{ color: mutedColor }}>{owner}.</span>
            {name}
            <span style={{ color: mutedColor }}>{descriptor}</span>
        </>
        : <>
            <span style={{ color: mutedColor }}>{owner}.</span>
            {name}
            <span style={{ color: mutedColor }}>: {descriptor}</span>
        </>;
}

const SearchResults = () => {
    const { token } = theme.useToken();
    const results = useObservable(searchResults);

    return (
        <List<SearchResult>
            size="small"
            dataSource={results}
            renderItem={(item) => (
                <Dropdown
                    menu={{ items: getMenuItems(getSearchResultToken(item)) }}
                    trigger={["contextMenu"]}
                >
                    <List.Item
                        onClick={() => openSearchResult(item)}
                        style={{
                            cursor: "pointer",
                            padding: "2px 8px",
                            fontSize: "12px",
                            transition: "background-color 0.2s"
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        {formatSearchResult(item, token.colorTextTertiary)}
                    </List.Item>
                </Dropdown>
            )}
        />
    );
};

export default SearchResults;
