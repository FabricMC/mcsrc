import { BehaviorSubject, combineLatest, map, Observable, switchMap } from "rxjs";

export type ModifierKey = 'Ctrl' | 'Alt' | 'Shift';
export type Key = string;
export type KeybindValue =
    | Key
    | `${ModifierKey}+${Key}`
    | `${ModifierKey}+${ModifierKey}+${Key}`
    | `${ModifierKey}+${ModifierKey}+${ModifierKey}+${Key}`;

export class BooleanSetting {
    private key: string;
    private subject: BehaviorSubject<boolean>;

    constructor(key: string, defaultValue: boolean) {
        const stored = localStorage.getItem(`setting_${key}`);
        const initialValue = stored !== null ? stored === 'true' : defaultValue;

        this.key = key;
        this.subject = new BehaviorSubject<boolean>(initialValue);
    }

    get observable(): Observable<boolean> {
        return this.subject;
    }

    get value(): boolean {
        return this.subject.value;
    }

    set value(newValue: boolean) {
        this.subject.next(newValue);
        localStorage.setItem(`setting_${this.key}`, newValue.toString());
    }
}

export class KeybindSetting {
    private key: string;
    private subject: BehaviorSubject<KeybindValue>;
    private defaultValue: KeybindValue;

    constructor(key: string, defaultValue: KeybindValue) {
        const stored = localStorage.getItem(`setting_${key}`);
        const initialValue = stored !== null ? stored : defaultValue;

        this.key = key;
        this.defaultValue = defaultValue;
        this.subject = new BehaviorSubject<KeybindValue>(initialValue);
    }

    get observable(): Observable<KeybindValue> {
        return this.subject;
    }

    get value(): KeybindValue {
        return this.subject.value;
    }

    set value(newValue: KeybindValue) {
        this.subject.next(newValue);
        localStorage.setItem(`setting_${this.key}`, newValue);
    }

    reset(): void {
        this.value = this.defaultValue;
    }

    setFromEvent(event: KeyboardEvent): void {
        const parts: string[] = [];

        if (event.ctrlKey) parts.push('Ctrl');
        if (event.altKey) parts.push('Alt');
        if (event.shiftKey) parts.push('Shift');
        if (event.metaKey) parts.push('Cmd');

        const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
        if (!modifierKeys.includes(event.key)) {
            parts.push(event.key);
        }

        if (parts.length > 0) {
            this.value = parts.join('+');
        }
    }

    parse(): { ctrl: boolean; alt: boolean; shift: boolean; cmd: boolean; key: string | null; } {
        const keys = this.value.split('+').map(k => k.toLowerCase());
        const modifierKeys = ['ctrl', 'alt', 'shift', 'cmd'];
        const mainKey = keys.find(k => !modifierKeys.includes(k)) ?? null;

        return {
            ctrl: keys.includes('ctrl'),
            alt: keys.includes('alt'),
            shift: keys.includes('shift'),
            cmd: keys.includes('cmd'),
            key: mainKey
        };
    }

    matches(event: KeyboardEvent): boolean {
        const parsed = this.parse();
        if (event.ctrlKey !== parsed.ctrl) return false;
        if (event.altKey !== parsed.alt) return false;
        if (event.shiftKey !== parsed.shift) return false;
        if (event.metaKey !== parsed.cmd) return false;

        if (!parsed.key) return false;

        return event.key.toLowerCase() === parsed.key.toLowerCase();
    }
}

export const agreedEula = new BooleanSetting('eula', false);
export const enableTabs = new BooleanSetting('enable_tabs', true);
export const displayLambdas = new BooleanSetting('display_lambdas', false);
export const focusSearch = new KeybindSetting('focus_search', 'Ctrl+ ');

export const supportsPermalinking = combineLatest([displayLambdas.observable]).pipe(
    map(([lambdaDisplay]) => {
        if (lambdaDisplay) {
            // Alters the decompilation output, so permalinks are not stable
            return false;
        }

        return true;
    })
);

export function resetPermalinkAffectingSettings(): void {
    displayLambdas.value = false;
}