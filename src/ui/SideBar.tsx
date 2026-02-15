import type { InputRef, SearchProps } from "antd/es/input";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Divider, Flex, Input } from "antd";
import { useEffect, useRef } from "react";

import { formatReferenceQuery, isViewingReferences } from "../logic/FindAllReferences";
import { isSearching } from "../logic/JarFile";
import { focusSearchEvent } from "../logic/Keybinds";
import { searchQuery, referencesQuery } from "../logic/State";
import { useObservable } from "../utils/UseObservable";
import FileList from "./FileList";
import Header from "./Header";
import ReferenceResults from "./ReferenceResults";
import SearchResults from "./SearchResults";

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

  const onChange: SearchProps["onChange"] = (e) => {
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
        <Search
          ref={searchRef}
          placeholder="Search classes"
          allowClear
          onChange={onChange}
        ></Search>
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
