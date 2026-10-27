import { Dropdown, List, message, theme } from "antd";
import type { MenuProps } from "antd";
import { searchResults, type SearchResult } from "../logic/JarFile";
import { useObservable } from "../utils/UseObservable";
import { openCodeTab, openInheritanceViewTab } from "../logic/tabs";
import { referencesQuery } from "../logic/State";
import { dottedClassNameFromClassName, outerClassFilePath, toClassFilePath, toClassName, withoutClassExtension, type ClassName } from "../utils/Names";
import { requestTokenJump } from "./CodeExtensions";
import type { ReferenceKey } from "../workers/jar-index/types";

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

    const [className, name, descriptor] = item.value.split(":");
    return {
        type: item.type === "methods" ? "method" : "field",
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

    return outerClassFilePath(toClassFilePath(toClassName(item.value.split(":")[0])));
}

function openSearchResult(item: SearchResult) {
    const classFilePath = getResultClassFilePath(item);

    if (item.type !== "classes") {
        const [, name, descriptor] = item.value.split(":");
        const targetType = item.type === "methods" ? "method" : "field";
        const target = targetType === "method" ? `${name}:${descriptor}` : name;
        requestTokenJump(classFilePath, targetType, target);
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
