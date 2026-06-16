import { BehaviorSubject, combineLatest, distinct, distinctUntilChanged, map, Observable, switchMap, throttleTime } from 'rxjs';
import { minecraftJar } from './MinecraftApi';
import { performSearch } from './Search';
import { searchQuery } from './State';
import { isClassFilePath, type ClassFilePath } from '../utils/Names';

export const fileList = minecraftJar.pipe(
    distinctUntilChanged(),
    map(jar => Object.keys(jar.jar.entries))
);

// File list that only contains outer class files
export const classesList = fileList.pipe(
    map(files => files.filter((file): file is ClassFilePath => isClassFilePath(file) && !file.includes('$')))
);

const debouncedSearchQuery: Observable<string> = searchQuery.pipe(
    throttleTime(200),
    distinctUntilChanged()
);

export const searchResults: Observable<ClassFilePath[]> = combineLatest([classesList, debouncedSearchQuery]).pipe(
    switchMap(([classes, query]) => {
        return [performSearch(query, classes)];
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);
