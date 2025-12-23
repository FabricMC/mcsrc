import { BehaviorSubject, filter, fromEvent, Observable, tap } from "rxjs";
import { focusSearch, type KeybindSetting } from "./Settings";

// Set to true when the user is currently capturing a keybind
export const capturingKeybind = new BehaviorSubject<boolean>(false);

export const rawKeydownEvent = fromEvent<KeyboardEvent>(document, 'keydown');

// Keydown events that should be listened to for general operation
export const keyDownEvent = rawKeydownEvent.pipe(
    filter(() => !capturingKeybind.value)
);

function keyBindEvent(setting: KeybindSetting): Observable<KeyboardEvent> {
    return keyDownEvent.pipe(
        filter(event => setting.matches(event)),
        tap(event => event.preventDefault())
    );
}

export const focusSearchEvent = keyBindEvent(focusSearch);