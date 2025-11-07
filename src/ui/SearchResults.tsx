import { List } from "antd";
import { searchResults } from "../logic/Search";
import { useObservable } from "../utils/UseObservable";
import { setSelectedFile } from "../logic/State";

const SearchResults = () => {
    const results = useObservable(searchResults);

    return (
        <List
            size="small"
            dataSource={results}
            renderItem={(item) => (
                <List.Item
                    onClick={() => setSelectedFile(item)}
                    style={{
                        cursor: "pointer",
                        padding: "2px 8px",
                        fontSize: "12px",
                        transition: "background-color 0.2s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    {item.replace(/\.class$/, '')}
                </List.Item>
            )}
        />
    );
};

export default SearchResults;