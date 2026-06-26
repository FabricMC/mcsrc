import { Button, Divider, Dropdown, Flex, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputProps, InputRef } from "antd/es/input";
import type { MenuProps } from "antd";
import { useObservable } from "../utils/UseObservable";
import { isSearching } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import ReferenceResults from "./ReferenceResults";
import { formatReferenceQuery, isViewingReferences } from "../logic/FindAllReferences";
import { ArrowLeftOutlined, DownOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { useEffect, useRef } from "react";
import { searchQuery, referencesQuery, searchType, type SearchType } from "../logic/State";

const SideBar = () => {
    const showReference = useObservable(isViewingReferences);
    const currentReferenceQuery = useObservable(referencesQuery);
    const currentSearchType = useObservable(searchType);
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

    const onChange: InputProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    const searchTypeMenuItems: MenuProps["items"] = [
        { key: "classes", label: "Classes" },
        { key: "methods", label: "Methods" },
        { key: "fields", label: "Fields" }
    ];

    const onSearchTypeMenuClick: MenuProps["onClick"] = ({ key }) => {
        searchType.next(key as SearchType);
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
                        References of: {currentReferenceQuery ? formatReferenceQuery(currentReferenceQuery) : ""}
                    </div>
                </>
            ) : (
                <Input
                    ref={searchRef}
                    className="class-search-input"
                    type="search"
                    placeholder={`Search ${currentSearchType}`}
                    allowClear
                    onChange={onChange}
                    addonAfter={
                        <Dropdown
                            menu={{
                                items: searchTypeMenuItems,
                                selectable: true,
                                selectedKeys: [currentSearchType],
                                onClick: onSearchTypeMenuClick
                            }}
                            trigger={["click"]}
                        >
                            <Button
                                type="text"
                                size="small"
                                icon={<DownOutlined />}
                                aria-label="Search type"
                                title={`Search type: ${currentSearchType}`}
                                style={{ width: 22 }}
                            />
                        </Dropdown>
                    }
                />
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
