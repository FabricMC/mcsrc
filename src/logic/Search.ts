import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, Observable, switchMap, take, throttleTime, toArray } from "rxjs";
import { classesList } from "./JarFile";


export const searchQuery = new BehaviorSubject("");

const deboucnedSearchQuery: Observable<string> = searchQuery.pipe(
    throttleTime(200),
    distinctUntilChanged()
);

export const searchResults: Observable<string[]> = combineLatest([classesList, deboucnedSearchQuery]).pipe(
    switchMap(([classes, query]) => {
        if (query.length === 0) {
            return [[]];
        }

        const lowerQuery = query.toLowerCase();

        return from(classes).pipe(
            filter(className => {
                const simpleClassName = className.split('/').pop() || className;
                return simpleClassName.toLowerCase().includes(lowerQuery);
            }),
            take(100),
            toArray(),
        );
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);
