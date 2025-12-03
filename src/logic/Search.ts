import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, from, map, Observable, switchMap, take, throttleTime, toArray } from "rxjs";
import { classesList } from "./JarFile";
import { classContainsString, parseClassFile, type SearchOptions } from "./../utils/Classfile";
import { minecraftJar } from './MinecraftApi';

export type SearchModeConfig =
    | { mode: 'className'; }
    | { mode: 'classContent'; options: SearchOptions; };

export const searchQuery = new BehaviorSubject("");

export const searchMode = new BehaviorSubject<SearchModeConfig>({
    mode: 'className'
});

export const searchProgress = new BehaviorSubject<number>(-1);

const deboucnedSearchQuery: Observable<string> = searchQuery.pipe(
    distinctUntilChanged()
);

export const searchResults: Observable<string[]> = combineLatest([minecraftJar, classesList, deboucnedSearchQuery, searchMode]).pipe(
    switchMap(([minecraftJar, classes, query, modeConfig]) => {
        if (query.length === 0) {
            searchProgress.next(-1);
            return from([[]]);
        }

        // Class content search mode: search within class constant pools
        if (modeConfig.mode === 'classContent') {
            const searchString = query.startsWith('#') ? query.substring(1) : query;
            if (searchString.length === 0) {
                searchProgress.next(-1);
                return from([[]]);
            }

            return new Observable<string[]>((subscriber) => {
                const performSearch = async () => {
                    const matchingClasses: string[] = [];
                    const totalClasses = classes.length;

                    searchProgress.next(0);
                    console.log('Starting class content search for:', searchString, 'Total classes:', totalClasses);

                    for (let i = 0; i < classes.length; i++) {
                        const className = classes[i];
                        if (matchingClasses.length >= 100) break;

                        // Update progress every 10 items
                        if (i % 10 === 0) {
                            const progressValue = Math.round((i / totalClasses) * 100);
                            console.log('Search progress:', progressValue, 'iteration:', i);
                            searchProgress.next(progressValue);
                            // Yield to event loop to prevent UI blocking
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }

                        try {
                            const classEntry = minecraftJar.jar.entries[className];
                            if (classEntry) {
                                const classFile = await parseClassFile(await classEntry.bytes());
                                if (classContainsString(classFile, searchString, modeConfig.options)) {
                                    matchingClasses.push(className);
                                }
                            }
                        } catch (e) {
                            // Skip classes that fail to parse
                            console.warn(`Failed to parse ${className}:`, e);
                        }
                    }

                    console.log('Search completed successfully. Found:', matchingClasses.length, 'matches');
                    searchProgress.next(-1);
                    subscriber.next(matchingClasses);
                    subscriber.complete();
                };

                performSearch().catch((error) => {
                    console.error('Search error:', error);
                    searchProgress.next(-1);
                    subscriber.error(error);
                });
            });
        }

        // Class name search mode: search by class name
        searchProgress.next(-1);
        const lowerQuery = query.toLowerCase();

        return from([
            classes
                .filter(className => {
                    const simpleClassName = className.split('/').pop() || className;
                    return simpleClassName.toLowerCase().includes(lowerQuery);
                })
                .slice(0, 100)
        ]);
    })
);

export const isSearching = searchQuery.pipe(
    map((query) => query.length > 0)
);
