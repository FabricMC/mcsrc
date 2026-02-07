import { distinctUntilChanged, fromEvent, map, startWith, throttleTime } from "rxjs";

export const isThin = fromEvent(window, 'resize').pipe(
    startWith(null),
    map(() => window.innerWidth < 800),
    throttleTime(50),
    distinctUntilChanged()
);