import { combineLatest, distinctUntilChanged, fromEvent, map, merge, Observable, startWith, switchMap, throttleTime } from "rxjs";
import { theme } from "./Settings";

export const isThin = fromEvent(window, 'resize').pipe(
    startWith(null),
    map(() => window.innerWidth < 800),
    throttleTime(50),
    distinctUntilChanged()
);

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDarkMode = new Observable<boolean>(subscriber => {
    const emit = () => subscriber.next(darkModeQuery.matches);
    emit();

    darkModeQuery.addEventListener("change", emit);
    return () => {
        darkModeQuery.removeEventListener("change", emit);
    };
}).pipe(
    distinctUntilChanged()
);

export const isDarkMode = combineLatest([theme.observable, systemDarkMode]).pipe(
    map(([themeMode, systemDark]) => {
        if (themeMode === 'dark') return true;
        if (themeMode === 'light') return false;
        return systemDark;
    }),
    distinctUntilChanged()
);