import { catchError, distinctUntilChanged, from, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import type { ClassName } from '../utils/Names';
import { activeJavadocFile } from './JavadocState';
import { RuntimeLibraries } from './RuntimeLibraries';

export const runtimeLibraryClassNames = activeJavadocFile.pipe(
    map(file => file?.kind === 'directory' ? file.runtimeLibraries : undefined),
    distinctUntilChanged((previous, current) => previous?.id === current?.id),
    switchMap(config => {
        const empty = new Set<ClassName>();
        if (!config) return of(empty);

        const libraries = new RuntimeLibraries();
        libraries.load(config);
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
