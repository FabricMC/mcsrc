import React, { useEffect, useRef, useState } from "react";
import { fullTextSearchEvent } from "../logic/Keybinds";
import { useObservable } from "../utils/UseObservable";
import { Button, Flex, Input, List, Modal, type InputRef } from "antd";
import { BehaviorSubject, catchError, combineLatest, distinctUntilChanged, from, map, of, startWith, switchMap } from "rxjs";
import { fullTextSearch } from "../workers/full-text-search/client";
import type { FullTextSearchResult } from "../workers/full-text-search/worker";
import { openCodeTab } from "../logic/tabs";

const SearchState = (r: SearchState) => r;
type SearchState =
    | { state: "loading"; }
    | { state: "ok"; results: FullTextSearchResult[]; }
    | { state: "error"; error: string; };

const query = new BehaviorSubject("");
const search$ = combineLatest([fullTextSearch, query]).pipe(
    distinctUntilChanged(),
    switchMap(([fts, query]) => {
        if (query.length < 3) return of(SearchState({
            state: "error",
            error: "Query must be at least 3 characters"
        }));

        return from(fts.find(query, { maxTokens: 11 })).pipe(
            map(results => SearchState({ state: "ok", results })),
            startWith(SearchState({ state: "loading" })),
            catchError(error => of(SearchState({ state: "error", error: String(error) }))));
    }));

type FullTextSearchResultElementProps = {
    result: FullTextSearchResult;
};

const FullTextSearchResultElement: React.FC<FullTextSearchResultElementProps> = ({ result }) => {
    const [expand, setExpand] = useState(false);

    const sliced = expand ? result.regions : result.regions.slice(0, 5);
    const canToggleExpand = expand || sliced.length < result.regions.length;

    return (
        <List.Item.Meta
            title={result.key}
            description={(
                <>
                    {canToggleExpand && (
                        <Button
                            type="link"
                            onClick={(e) => { e.stopPropagation(); setExpand(!expand); }}
                        >
                            {expand ? "Hide" : "Show all"}
                        </Button>
                    )}
                    {sliced.map((r, i) => (
                        <div
                            key={i}
                            style={{
                                fontFamily: "monospace",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {r.snippet}
                        </div>
                    ))}
                </>
            )}
        />
    );
};

const FullTextSearchModal = () => {
    const showEvent = useObservable(fullTextSearchEvent);
    const search = useObservable(search$) ?? { state: "ok", results: [] };
    const [open, setOpen] = useState(false);
    const inputRef = useRef<InputRef>(null);

    useEffect(() => {
        if (showEvent) {
            setOpen(true);
        }
    }, [showEvent]);

    function openResult(result: FullTextSearchResult) {
        setOpen(false);
        openCodeTab(result.key);
    }

    let resultsElement;
    if (search.state === "loading") {
        resultsElement = (<div>Loading...</div>);
    } else if (search.state === "error") {
        resultsElement = (<div>{search.error}</div>);
    } else if (search.results.length === 0) {
        resultsElement = (<div>No results</div>);
    } else {
        resultsElement = (
            <List
                dataSource={search.results}
                renderItem={result => (
                    <List.Item
                        onClick={() => openResult(result)}
                        className="full-text-search-item"
                    >
                        <FullTextSearchResultElement result={result} />
                    </List.Item>
                )}
            />
        );
    }

    return (
        <Modal
            title="Full Text Search"
            open={open}
            onCancel={() => setOpen(false)}
            afterOpenChange={open => open && inputRef.current?.focus()}
            footer={null}
            width="50%"
        >
            <Flex vertical gap="medium">
                <Input.Search
                    ref={inputRef}
                    placeholder="Search for occurence"
                    onSearch={q => query.next(q.trim())}
                />
                <div style={{
                    maxHeight: "70vh",
                    overflow: "scroll"
                }}>
                    {resultsElement}
                </div>
            </Flex>
        </Modal>
    );
};
export default FullTextSearchModal;
