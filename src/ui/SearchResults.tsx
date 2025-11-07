import { List } from "antd";
import { searchResults } from "../logic/Search";
import { useObservable } from "../utils/UseObservable";
import { setSelectedFile } from "../logic/State";

const SearchResults = () => {
    const results = useObservable(searchResults);

    console.log("SearchResults component rendered.");

    return (
        <List
            size="small"
            dataSource={results}
            renderItem={(item) => (
                <List.Item
                    onClick={() => setSelectedFile(item)}
                    style={{ cursor: "pointer", padding: "4px 8px" }}
                >
                    {item}
                </List.Item>
            )}
        />
    );
};

export default SearchResults;