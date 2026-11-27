import { BehaviorSubject, concatMap, debounce, distinctUntilChanged, EMPTY, filter, firstValueFrom, fromEvent, map, of, Subject, switchMap, timer } from "rxjs";
import type { Token } from "../logic/Tokens";
import { activeJavadocFile, getJavadocForToken, saveTokenJavadoc } from "./Javadoc";

const AUTOSAVE_DELAY = 2000;
const drafts = new BehaviorSubject<ReadonlyMap<string, JavadocDraft>>(new Map());
const saveRequests = new Subject<() => Promise<void>>();

drafts.pipe(
    map(drafts => drafts.size > 0),
    distinctUntilChanged(),
    switchMap(unsaved => unsaved ? fromEvent<BeforeUnloadEvent>(window, "beforeunload") : EMPTY),
).subscribe(event => {
    event.preventDefault();
});

// Mapping writes share mutable storage and can target the same file.
// Keep each write subscribed until it finishes, even after its editor closes.
saveRequests.pipe(concatMap(save => save())).subscribe();

export async function flushJavadocDrafts() {
    await Promise.all(Array.from(drafts.value.values(), draft => draft.flush()));
    if (drafts.value.size > 0) {
        throw new Error("Save the current Javadoc changes before opening another mapping source.");
    }
}

export function getJavadocDraft(token: Token, onError: (error: unknown) => void): JavadocDraft {
    const key = getDraftKey(token);
    const existing = drafts.value.get(key);
    if (existing && existing.source === activeJavadocFile.value) return existing;

    return new JavadocDraft(key, token, onError);
}

function getDraftKey(token: Token): string {
    const member = token.type === "field" || token.type === "method";
    return JSON.stringify({
        type: token.type,
        className: token.className,
        name: member ? token.name : undefined,
        descriptor: member ? token.descriptor : undefined,
    });
}

class JavadocDraft {
    readonly source = activeJavadocFile.value;
    readonly status = new BehaviorSubject<"saved" | "unsaved" | "saving" | "error">("saved");
    value: string;
    private savedValue: string;
    private readonly requests = new Subject<"change" | "flush">();
    private readonly key: string;
    private readonly token: Token;
    private readonly onError: (error: unknown) => void;

    constructor(key: string, token: Token, onError: (error: unknown) => void) {
        this.key = key;
        this.token = token;
        this.onError = onError;
        this.value = getJavadocForToken(token) ?? "";
        this.savedValue = this.value;
        this.requests.pipe(
            debounce(request => request === "flush" ? of(0) : timer(AUTOSAVE_DELAY)),
        ).subscribe(() => this.queueSave());
    }

    update(value: string) {
        this.value = value;
        this.requests.next("change");
        if (value === this.savedValue && this.status.value !== "saving") {
            this.markSaved();
            return;
        }

        drafts.next(new Map(drafts.value).set(this.key, this));
        if (this.status.value !== "saving") this.status.next("unsaved");
    }

    async flush(): Promise<void> {
        this.requests.next("flush");
        await firstValueFrom(this.status.pipe(filter(status => status !== "saving")));
    }

    private queueSave() {
        if (this.status.value === "saving" || this.value === this.savedValue) return;
        this.status.next("saving");
        saveRequests.next(() => this.save());
    }

    private async save() {
        try {
            while (this.value !== this.savedValue) {
                const value = this.value;
                await saveTokenJavadoc(this.token, value, this.source);
                this.savedValue = value;
            }
            this.markSaved();
        } catch (error) {
            this.status.next("error");
            this.onError(error);
        }
    }

    private markSaved() {
        if (drafts.value.get(this.key) === this) {
            const remaining = new Map(drafts.value);
            remaining.delete(this.key);
            drafts.next(remaining);
        }
        this.status.next("saved");
    }
}
