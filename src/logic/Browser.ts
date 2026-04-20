import { distinctUntilChanged, fromEvent, map, merge, Observable, startWith, throttleTime } from "rxjs";

export const isThin = fromEvent(window, 'resize').pipe(
    startWith(null),
    map(() => window.innerWidth < 800),
    throttleTime(50),
    distinctUntilChanged()
);

const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
export const isDarkMode = new Observable(subscriber => {
    const emit = () => subscriber.next(darkModeQuery.matches);
    emit(); // emit initial value

    darkModeQuery.addEventListener("change", emit);
    return () => {
        darkModeQuery.removeEventListener("change", emit);
    };
}).pipe(
    distinctUntilChanged()
);