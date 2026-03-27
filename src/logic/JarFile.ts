import { combineLatest, distinctUntilChanged, map, Observable } from 'rxjs';
import { minecraftJar } from './MinecraftApi';
import { searchQuery } from './State';
import Fuse from 'fuse.js';

export const fileList = minecraftJar.pipe(
    distinctUntilChanged(),
    map(jar => Object.keys(jar.jar.entries))
);

// File list that only contains outer class files
export const outerClassesList = fileList.pipe(
    map(files => files.filter(file => file.endsWith('.class') && !file.includes('$')))
);

export const outerClassSearch = outerClassesList.pipe(
    map(classes => {
        const list = classes.map(className => {
            let simpleClassName = className;

            const pos = className.lastIndexOf('/');
            if (pos !== -1) simpleClassName = className.substring(pos);

            return { 'class': simpleClassName, key: className };
        });

        return new Fuse(list, {
            minMatchCharLength: 3,
            keys: ['class']
        });
    })
);

const debouncedSearchQuery: Observable<string> = searchQuery.pipe(
    distinctUntilChanged()
);

export const searchResults: Observable<string[]> = combineLatest([outerClassSearch, debouncedSearchQuery]).pipe(
    map(([search, query]) => {
        const results = search.search(query);
        return results.map(r => r.item.key);
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);
