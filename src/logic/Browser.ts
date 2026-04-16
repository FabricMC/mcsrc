import { distinctUntilChanged, fromEvent, map, merge, startWith, throttleTime } from "rxjs";

export const isThin = fromEvent(window, 'resize').pipe(
    startWith(null),
    map(() => window.innerWidth < 800),
    throttleTime(50),
    distinctUntilChanged()
);

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
export const isDarkMode = merge(
    fromEvent<MediaQueryListEvent>(darkModeQuery, 'change').pipe(map(e => e.matches)),
).pipe(
    startWith(darkModeQuery.matches),
    distinctUntilChanged()
);