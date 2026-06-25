import { List, theme } from "antd";
import { searchResults } from "../logic/JarFile";
import { useObservable } from "../utils/UseObservable";
import { openCodeTab } from "../logic/tabs";
import { withoutClassExtension, type ClassFilePath } from "../utils/Names";

const SearchResults = () => {
    const { token } = theme.useToken();
    const results = useObservable(searchResults);

    return (
        <List<ClassFilePath>
            size="small"
            dataSource={results}
            renderItem={(item) => (
                <List.Item
                    onClick={() => openCodeTab(item)}
                    style={{
                        cursor: "pointer",
                        padding: "2px 8px",
                        fontSize: "12px",
                        transition: "background-color 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    {((path) => <>
                        <span style={{ color: token.colorTextTertiary }}>{path.slice(0, path.lastIndexOf("/") + 1)}</span>
                        {path.slice(path.lastIndexOf("/") + 1)}
                    </>)(withoutClassExtension(item))}
                </List.Item>
            )}
        />
    );
};

export default SearchResults;
