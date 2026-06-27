import { combineLatest, debounceTime, distinctUntilChanged, map, Observable, switchMap } from 'rxjs';
import { minecraftJar } from './MinecraftApi';
import { performSearch } from './Search';
import { searchQuery, searchType } from './State';
import { isClassFilePath, type ClassFilePath } from '../utils/Names';
import { jarIndex } from '../workers/jar-index/client';
import type { Field, Method } from '../workers/jar-index/types';

export const fileList = minecraftJar.pipe(
    distinctUntilChanged(),
    map(jar => Object.keys(jar.jar.entries))
);

// File list that only contains outer class files
export const classesList = fileList.pipe(
    map(files => files.filter((file): file is ClassFilePath => isClassFilePath(file) && !file.includes('$')))
);

const debouncedSearchQuery: Observable<string> = searchQuery.pipe(
    debounceTime(200),
    distinctUntilChanged()
);

export type SearchResult =
    | { type: "classes"; value: ClassFilePath }
    | { type: "methods"; value: Method }
    | { type: "fields"; value: Field };

function memberSearchText(member: Method | Field): string {
    return member.split(":")[1] || member;
}

export const searchResults: Observable<SearchResult[]> = combineLatest([classesList, jarIndex, debouncedSearchQuery, searchType]).pipe(
    switchMap(async ([classes, index, query, type]) => {
        if (type === "classes") {
            return performSearch(query, classes).map(value => ({ type, value }));
        }

        const memberData = await index.getMemberData();
        if (type === "methods") {
            const members = memberData.flatMap(data => data.methods)
                .filter((member): member is Method => member.length > 0);

            return performSearch(query, members, memberSearchText).map(value => ({ type, value }));
        }

        const members = memberData.flatMap(data => data.fields)
            .filter((member): member is Field => member.length > 0);

        return performSearch(query, members, memberSearchText).map(value => ({ type, value }));
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);
