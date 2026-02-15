// oxlint-disable typescript/no-redundant-type-constituents
import { BehaviorSubject, combineLatest, distinctUntilChanged, map, Observable, switchMap } from "rxjs";
import * as decompiler from "../workers/decompile/client";


export type ModifierKey = 'Ctrl' | 'Alt' | 'Shift';
export type Key = string;
export type KeybindValue =
    | Key
    | `${ModifierKey}+${Key}`
    | `${ModifierKey}+${ModifierKey}+${Key}`
    | `${ModifierKey}+${ModifierKey}+${ModifierKey}+${Key}`;

abstract class Setting<T> {
    protected key: string;
    protected subject: BehaviorSubject<T>;
    readonly defaultValue: T;
    private toString: (t: T) => string;

    constructor(key: string, defaultValue: T, fromString: (s: string) => T, toString: (t: T) => string) {
        const stored = localStorage.getItem(`setting_${key}`);
        const initialValue = stored ? fromString(stored) : defaultValue;

        this.key = key;
        this.subject = new BehaviorSubject(initialValue);
        this.defaultValue = defaultValue;
        this.toString = toString;

        window.addEventListener('storage', (event) => {
            if (event.key === `setting_${this.key}` && event.newValue !== null) {
                const newValue = fromString(event.newValue);
                if (this.subject.value !== newValue) {
                    this.subject.next(newValue);
                }
            }
        });
    }

    get observable(): Observable<T> {
        return this.subject;
    }

    get value(): T {
        return this.subject.value;
    }

    set value(newValue: T) {
        this.subject.next(newValue);
        localStorage.setItem(`setting_${this.key}`, this.toString(newValue));
    }
}

export class BooleanSetting extends Setting<boolean> {
    constructor(key: string, defaultValue: boolean) {
        super(key, defaultValue, s => s === "true", b => b ? "true" : "false");
    }
}

export class NumberSetting extends Setting<number> {
    constructor(key: string, defaultValue: number) {
        super(key, defaultValue, (s) => {
            const n = Number.parseInt(s);
            return Number.isNaN(n) ? defaultValue : n;
        }, n => n.toString());
    }
}

export class KeybindSetting extends Setting<KeybindValue> {
    constructor(key: string, defaultValue: KeybindValue) {
        super(key, defaultValue, s => s, v => v);
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
export const compactPackages = new BooleanSetting('compact_packages', true);
export const displayLambdas = new BooleanSetting('display_lambdas', false);
export const bytecode = new BooleanSetting('bytecode', false);
export const unifiedDiff = new BooleanSetting('unified_diff', false);
export const focusSearch = new KeybindSetting('focus_search', 'Ctrl+ ');
export const showStructure = new KeybindSetting('show_structure', 'Ctrl+F12');

export const preferWasmDecompiler = new BooleanSetting('prefer_wasm_decompiler', true);
preferWasmDecompiler.observable
    .pipe(distinctUntilChanged())
    .subscribe((v) => decompiler.setRuntime(v));

export const MAX_THREADS = navigator.hardwareConcurrency || 4;
export const decompilerThreads = new NumberSetting("decompiler_threads", Math.max(MAX_THREADS / 2, 1));
export const decompilerSplits = new NumberSetting("decompiler_splits", 100);

export const supportsPermalinking = combineLatest([displayLambdas.observable, bytecode.observable]).pipe(
    map(([lambdaDisplay, bytecode]) => {
        if (lambdaDisplay || bytecode) {
            // Alters the decompilation output, so permalinks are not stable
            return false;
        }

        return true;
    })
);

export function resetPermalinkAffectingSettings(): void {
    displayLambdas.value = false;
    bytecode.value = false;
}
