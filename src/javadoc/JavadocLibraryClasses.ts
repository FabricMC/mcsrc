import { catchError, distinctUntilChanged, from, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import type { ClassName } from '../utils/Names';
import { activeJavadocFile } from './JavadocState';
import { RuntimeLibraries } from './RuntimeLibraries';

export const javadocRuntimeLibraries = activeJavadocFile.pipe(
    map(file => file?.kind === 'directory' ? file.runtimeLibraries : undefined),
    distinctUntilChanged((previous, current) => previous?.id === current?.id),
    map(config => {
        const libraries = new RuntimeLibraries();
        libraries.load(config);
        return libraries;
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
);

export const runtimeLibraryClassNames = javadocRuntimeLibraries.pipe(
    switchMap(libraries => {
        const empty = new Set<ClassName>();
        return from(libraries.getClassNames()).pipe(
            startWith(empty),
            catchError(error => {
                console.warn('Unable to load Javadoc library classes', error);
                return of(empty);
            }),
        );
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
);
