import { Card, Divider, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { SearchProps } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching, searchQuery } from "../logic/Search";
import SearchResults from "./SearchResults";
import { isThin } from "../logic/Browser";

const { Search } = Input;

const SideBar = () => {
    const isSmall = useObservable(isThin);

    const onChange: SearchProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    return (
        <Card cover={isSmall ? undefined : <Header />} variant="borderless">
            <Search placeholder="Search classes" allowClear onChange={onChange}></Search>
            <Divider size="small" />
            <FileListOrSearchResults />
        </Card>
    );
};

const FileListOrSearchResults = () => {
    const showSearchResults = useObservable(isSearching);
    if (showSearchResults) {
        return <SearchResults />;
    } else {
        return <FileList />;
    }
};

export default SideBar;
