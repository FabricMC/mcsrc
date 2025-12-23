import { Button, Card, Divider, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputRef, SearchProps } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching, searchQuery } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import UsageResults from "./UsageResults";
import { isThin } from "../logic/Browser";
import { formatUsageQuery, isViewingUsages, usageQuery } from "../logic/FindUsages";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { useEffect, useRef } from "react";

const { Search } = Input;

const SideBar = () => {
    const isSmall = useObservable(isThin);
    const showUsage = useObservable(isViewingUsages);
    const currentUsageQuery = useObservable(usageQuery);
    const focusSearch = useObservable(focusSearchEvent);
    const searchRef = useRef<InputRef>(null);

    useEffect(() => {
        if (focusSearch) {
            usageQuery.next("");
            searchRef?.current?.focus();
        }
    }, [focusSearch]);

    useEffect(() => {
        if (focusSearch && !showUsage) {
            searchRef?.current?.focus();
        }
    }, [focusSearch, showUsage]);

    const onChange: SearchProps['onChange'] = (e) => {

        searchQuery.next(e.target.value);
    };

    const onBackClick = () => {
        usageQuery.next("");
    };

    return (
        <Card cover={isSmall ? undefined : <Header />} variant="borderless">
            {showUsage ? (
                <>
                    <Button onClick={onBackClick} icon={<ArrowLeftOutlined />} block>
                        Back
                    </Button>
                    <div style={{ fontSize: "12px", textAlign: "center" }}>
                        Usages of: {formatUsageQuery(currentUsageQuery || "")}
                    </div>
                </>
            ) : (
                <Search ref={searchRef} placeholder="Search classes" allowClear onChange={onChange}></Search>
            )}
            <Divider size="small" />
            <FileListOrSearchResults />
        </Card>
    );
};

const FileListOrSearchResults = () => {
    const showSearchResults = useObservable(isSearching);
    const showUsage = useObservable(isViewingUsages);

    if (showUsage) {
        return <UsageResults />;
    } else if (showSearchResults) {
        return <SearchResults />;
    } else {
        return <FileList />;
    }
};

export default SideBar;
