import { BehaviorSubject, map, type Observable } from "rxjs";
import type { Token } from "../logic/Tokens";
import {
    getStoredJavadoc,
    setStoredJavadoc,
    writeJavadocFile,
    type JavadocElementKind,
    type JavadocFile,
} from "./JavadocStorage";

export type JavadocString = string;

export const activeJavadocFile = new BehaviorSubject<JavadocFile | null>(null);
export const javadocModeEnabled = activeJavadocFile.pipe(map(file => file !== null));
export const activeJavadocToken = new BehaviorSubject<Token | null>(null);
export const javadocRevision = new BehaviorSubject(0);

export function activateJavadocFile(file: JavadocFile) {
    activeJavadocFile.next(file);
    publishJavadocChange();
}

export async function saveTokenJavadoc(token: Token, javadoc: JavadocString | undefined) {
    const file = activeJavadocFile.value;
    if (!file) throw new Error("No Javadoc mapping file selected");

    const target = getJavadocTarget(token);
    if (!target) throw new Error("This token cannot have Javadoc");

    const previous = getStoredJavadoc(...target);
    setStoredJavadoc(...target, javadoc || null);

    try {
        await writeJavadocFile(file);
    } catch (error) {
        setStoredJavadoc(...target, previous);
        throw error;
    }

    publishJavadocChange();
}

export function observeJavadocForToken(token: Token): Observable<JavadocString | null> {
    return javadocRevision.pipe(map(() => getJavadocForToken(token)));
}

export function getJavadocForToken(token: Token): JavadocString | null {
    const target = getJavadocTarget(token);
    return target ? getStoredJavadoc(...target) : null;
}

function getJavadocTarget(token: Token): [
    JavadocElementKind,
    string,
    string,
    string,
] | null {
    switch (token.type) {
        case "class":
            return [0, token.className, "", ""];
        case "field":
            return [1, token.className, token.name, token.descriptor];
        case "method":
            return [2, token.className, token.name, token.descriptor];
        default:
            return null;
    }
}

function publishJavadocChange() {
    javadocRevision.next(javadocRevision.value + 1);
}
