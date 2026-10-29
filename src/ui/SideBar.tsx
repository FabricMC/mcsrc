import { Button, Checkbox, Divider, Flex, Input, Select, Space } from "antd";
import Header from "./Header";
import FileList from "./FileList";
import type { InputProps, InputRef } from "antd/es/input";
import { useObservable } from "../utils/UseObservable";
import { isSearching } from "../logic/JarFile";
import SearchResults from "./SearchResults";
import ReferenceResults from "./ReferenceResults";
import { formatReferenceQuery, isViewingReferences, methodReferenceKeys } from "../logic/FindAllReferences";
import { includeMethodHierarchy } from "../logic/Settings";
import { ArrowLeftOutlined, CaretDownOutlined } from "@ant-design/icons";
import { focusSearchEvent } from "../logic/Keybinds";
import { Fragment, useEffect, useRef, type JSX } from "react";
import { searchQuery, referencesQuery, searchType } from "../logic/State";
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

    const makeIconizedLabel = (text: React.ReactNode, Icon: typeof ClassIcon) =>
        <Flex align="center" gap={4}>
            <Icon style={{ fontSize: 20 }} />
            {text}
        </Flex>;

    const searchTypeMenuItems: { value: string, label: JSX.Element; }[] = [
        { value: "classes", label: makeIconizedLabel("Classes", ClassIcon) },
        { value: "methods", label: makeIconizedLabel("Methods", MethodIcon) },
        { value: "fields", label: makeIconizedLabel("Fields", FieldIcon) }
    ];

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
                <Space.Compact block>
                    <Input
                        ref={searchRef}
                        type="search"
                        placeholder={`Search ${currentSearchType}`}
                        allowClear
                        onChange={onChange}
                    />
                    <Select
                        aria-label="Search type"
                        title={`Search type: ${currentSearchType}`}
                        value={currentSearchType}
                        options={searchTypeMenuItems}
                        // use the label and not the suffix to have the icon
                        // be dimmed as well when the popup is open
                        labelRender={({ label }) =>
                            <Space.Compact block>
                                {label}
                                <CaretDownOutlined style={{ marginLeft: 4, color: "var(--ant-color-text)" }} />
                            </Space.Compact>
                        }
                        suffix={<></>}
                        styles={{ content: { marginRight: 0 } }}
                        onChange={value => searchType.next(value)}
                        popupMatchSelectWidth={112}
                        style={{ padding: "4px 7px", backgroundColor: "var(--ant-color-fill-alter)" }}
                    />
                </Space.Compact>
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
