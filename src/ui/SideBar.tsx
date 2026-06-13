import { useState } from "react";
import { Button, Divider, Flex, Input, Segmented } from "antd";
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
import GrepPanel from "./GrepPanel";

const { Search } = Input;

const SideBar = () => {
    const showReference = useObservable(isViewingReferences);
    const currentReferenceQuery = useObservable(referencesQuery);
    const focusSearch = useObservable(focusSearchEvent);
    const searchRef = useRef<InputRef>(null);
    const [sidebarTab, setSidebarTab] = useState<'classes' | 'grep'>('classes');

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

            {/* Tab switcher */}
            {!showReference && (
                <Segmented
                    block
                    size="small"
                    value={sidebarTab}
                    onChange={v => setSidebarTab(v as 'classes' | 'grep')}
                    options={[
                        { label: 'Classes', value: 'classes' },
                        { label: 'Grep', value: 'grep' },
                    ]}
                    style={{ marginBottom: 4 }}
                />
            )}

            {showReference ? (
                <>
                    <Button onClick={onBackClick} icon={<ArrowLeftOutlined />} block>
                        Back
                    </Button>
                    <div style={{ fontSize: "12px", textAlign: "center" }}>
                        References of: {formatReferenceQuery(currentReferenceQuery || "")}
                    </div>
                    <Divider size="small" />
                    <div style={{ flexGrow: 1, overflowY: "auto" }}>
                        <ReferenceResults />
                    </div>
                </>
            ) : sidebarTab === 'classes' ? (
                <>
                    <Search ref={searchRef} placeholder="Search classes" allowClear onChange={onChange} />
                    <Divider size="small" />
                    <div style={{ flexGrow: 1, overflowY: "auto" }}>
                        <FileListOrSearchResults />
                    </div>
                </>
            ) : (
                <>
                    <Divider size="small" />
                    <div style={{ flexGrow: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                        <GrepPanel />
                    </div>
                </>
            )}
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