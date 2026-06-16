import { List } from "antd";
import { searchResults } from "../logic/JarFile";
import { useObservable } from "../utils/UseObservable";
import { openCodeTab } from "../logic/tabs";
import { withoutClassExtension, type ClassFilePath } from "../utils/Names";

const SearchResults = () => {
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
                    {withoutClassExtension(item)}
                </List.Item>
            )}
        />
    );
};

export default SearchResults;
