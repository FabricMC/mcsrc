import { useEffect, useState } from "react";
import { fullTextSearchEvent } from "../logic/Keybinds";
import { useObservable } from "../utils/UseObservable";
import { Input, Modal } from "antd";
import { BehaviorSubject, combineLatest, switchMap } from "rxjs";
import { fullTextSearch } from "../workers/full-text-search/client";
import { currentResult } from "../logic/Decompiler";

const query = new BehaviorSubject("");
const resultsObs = combineLatest([fullTextSearch, query, currentResult]).pipe(
    switchMap(async ([fts, query, currentResult]) => {
        if (query.length < 3) return [];

        await fts.index(currentResult.className, currentResult.source);
        const res = await fts.find(query);
        return res;
    }));

const FullTextSearchModal = () => {
    const showEvent = useObservable(fullTextSearchEvent);
    const results = useObservable(resultsObs) ?? [];
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (showEvent) {
            setOpen(true);
        }
    }, [showEvent]);

    return (
        <Modal
            title="Full Text Search"
            open={open}
            onCancel={() => setOpen(false)}
            footer={null}
        >
            <Input.Search
                placeholder="Search for occurence"
                onSearch={q => query.next(q)}
            />
            {results.map(r => (
                <div>
                    <div>{r.key}</div>
                    <div>{r.snippet}</div>
                </div>
            ))}
        </Modal>
    );
};
export default FullTextSearchModal;
