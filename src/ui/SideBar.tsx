import { Button, Divider, Flex, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputRef, SearchProps } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import UsageResults from "./UsageResults";
import { formatUsageQuery, isViewingUsages } from "../logic/FindUsages";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { useEffect, useRef } from "react";
import { searchQuery, usageQuery } from "../logic/State";
import IndexProgress from "./IndexProgress";

const { Search } = Input;

const SideBar = () => {
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
        <Flex vertical style={{ height: "100%", padding: "0 4px" }}>
            <Header />
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
            <div style={{ flexGrow: 1, overflowY: "auto" }}>
                <FileListOrSearchResults />
            </div>
        </Flex>
    );
};

const FileListOrSearchResults = () => {
    const showSearchResults = useObservable(isSearching);
    const showUsage = useObservable(isViewingUsages);

    let children;
    if (showUsage) {
        children = <UsageResults />;
    } else if (showSearchResults) {
        children = <SearchResults />;
    } else {
        children = <FileList />;
    }

    return <IndexProgress children={children} />;
};

export default SideBar;
