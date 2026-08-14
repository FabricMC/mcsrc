import { List, theme } from "antd";
import { searchResults, type SearchResult } from "../logic/JarFile";
import { useObservable } from "../utils/UseObservable";
import { openCodeTab } from "../logic/tabs";
import { toClassFilePath, toClassName, withoutClassExtension } from "../utils/Names";

function getResultClassFilePath(item: SearchResult) {
    if (item.type === "classes") {
        return item.value;
    }

    return toClassFilePath(toClassName(item.value.split(":")[0].split("$")[0]));
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
                <List.Item
                    onClick={() => openCodeTab(getResultClassFilePath(item))}
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
            )}
        />
    );
};

export default SearchResults;
