import { Button, Checkbox, Divider, Dropdown, Flex, Input } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputProps, InputRef } from "antd/es/input";
import type { MenuProps } from "antd";
import { useObservable } from "../utils/UseObservable";
import { isSearching } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import ReferenceResults from "./ReferenceResults";
import { formatReferenceQuery, isViewingReferences, methodReferenceKeys } from "../logic/FindAllReferences";
import { includeMethodHierarchy } from "../logic/Settings";
import { ArrowLeftOutlined, CaretDownOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { useEffect, useRef } from "react";
import { searchQuery, referencesQuery, searchType, type SearchType } from "../logic/State";
import { ClassIcon, FieldIcon, MethodIcon } from "./intellij-icons";

const SideBar = () => {
    const showReference = useObservable(isViewingReferences);
    const currentReferenceQuery = useObservable(referencesQuery);
    const hierarchyKeys = useObservable(methodReferenceKeys) ?? [];
    const includeHierarchy = useObservable(includeMethodHierarchy.observable);
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

    type SearchTypeData = {
        key: SearchType;
        label: string;
        Icon: typeof ClassIcon;
    };

    const searchTypeMenuItems: SearchTypeData[] = [
        { key: "classes", label: "Classes", Icon: ClassIcon },
        { key: "methods", label: "Methods", Icon: MethodIcon },
        { key: "fields", label: "Fields", Icon: FieldIcon }
    ];

    const selectedSearchType = searchTypeMenuItems.find(type => type.key === currentSearchType);
    const SearchTypeIcon = selectedSearchType?.Icon ?? ClassIcon;

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
                    {hierarchyKeys.length > 1 && <Checkbox
                        checked={includeHierarchy}
                        onChange={event => {
                            includeMethodHierarchy.value = event.target.checked;
                        }}
                        style={{ marginTop: 8, alignSelf: "center" }}
                    >Include method hierarchy</Checkbox>}
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
                                items: searchTypeMenuItems.map(({ key, label, Icon }) => ({
                                    key,
                                    label,
                                    style: { paddingInline: "6px" },
                                    icon: <Icon style={{ fontSize: "20px", marginRight: "6px" }} />
                                })),
                                selectable: true,
                                selectedKeys: [currentSearchType],
                                onClick: onSearchTypeMenuClick
                            }}
                            trigger={["click"]}
                        >
                            <Button
                                type="text"
                                size="small"
                                icon={<SearchTypeIcon style={{ fontSize: "20px" }} />}
                                aria-label="Search type"
                                title={`Search type: ${selectedSearchType?.label ?? "Unknown"}`}
                                style={{ gap: "4px" }}
                            >
                                {selectedSearchType?.label ?? "Unknown"}
                                <CaretDownOutlined style={{ fontSize: "10px" }} />
                            </Button>
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
