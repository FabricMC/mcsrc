import { BehaviorSubject, map, type Observable } from "rxjs";
import { bytecode } from "../logic/Settings";
import type { Token } from "../logic/Tokens";
import {
    getStoredJavadoc,
    JavadocElementKind,
    setStoredJavadoc,
    writeJavadocSource,
    type JavadocSource,
} from "./JavadocStorage";

export type JavadocString = string;

export const activeJavadocFile = new BehaviorSubject<JavadocSource | null>(null);
export const activeJavadocToken = new BehaviorSubject<Token | null>(null);
export const javadocRevision = new BehaviorSubject(0);

export function activateJavadocFile(file: JavadocSource) {
    bytecode.value = false;
    activeJavadocFile.next(file);
    publishJavadocChange();
}

export function deactivateJavadocFile() {
    activeJavadocToken.next(null);
    activeJavadocFile.next(null);
    publishJavadocChange();
}

export async function saveTokenJavadoc(token: Token, javadoc: JavadocString | undefined) {
    const file = activeJavadocFile.value;
    if (!file) throw new Error("No Javadoc mapping file selected");

    const target = getJavadocTarget(token);
    if (!target) throw new Error("This token cannot have Javadoc");

    const previous = getStoredJavadoc(...target);
    const next = javadoc || null;
    if (previous === next) return;

    setStoredJavadoc(...target, next);

    try {
        await writeJavadocSource(file, target[1]);
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
            return [JavadocElementKind.Class, token.className, "", ""];
        case "field":
            return [JavadocElementKind.Field, token.className, token.name, token.descriptor];
        case "method":
            return [JavadocElementKind.Method, token.className, token.name, token.descriptor];
        default:
            return null;
    }
}

function publishJavadocChange() {
    javadocRevision.next(javadocRevision.value + 1);
}
