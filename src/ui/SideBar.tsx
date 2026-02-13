import { Button, Card, Divider, Flex, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputRef, SearchProps } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import ReferenceResults from "./ReferenceResults";
import { formatReferenceQuery, isViewingReferences } from "../logic/FindAllReferences";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { useEffect, useRef } from "react";
import { searchQuery, referencesQuery } from "../logic/State";

const { Search } = Input;

const SideBar = () => {
    const showReference = useObservable(isViewingReferences);
    const currentReferenceQuery = useObservable(referencesQuery);
    const focusSearch = useObservable(focusSearchEvent);
    const searchRef = useRef<InputRef>(null);

    useEffect(() => {
        if (focusSearch) {
            referencesQuery.next("");
            searchRef?.current?.focus();
        }
    }, [focusSearch]);

    useEffect(() => {
        if (focusSearch && !showReference) {
            searchRef?.current?.focus();
        }
    }, [focusSearch, showReference]);

    const onChange: SearchProps['onChange'] = (e) => {

        searchQuery.next(e.target.value);
    };

    const onBackClick = () => {
        referencesQuery.next("");
    };

    return (
        <Flex vertical style={{ height: "100%", padding: "0 4px" }}>
            <Header />
            {showReference ? (
                <>
                    <Button onClick={onBackClick} icon={<ArrowLeftOutlined />} block>
                        Back
                    </Button>
                    <div style={{ fontSize: "12px", textAlign: "center" }}>
                        References of: {formatReferenceQuery(currentReferenceQuery || "")}
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
    const showReference = useObservable(isViewingReferences);

    if (showReference) {
        return <ReferenceResults />;
    } else if (showSearchResults) {
        return <SearchResults />;
    } else {
        return <FileList />;
    }
};

export default SideBar;
