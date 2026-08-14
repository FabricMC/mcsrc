import { BehaviorSubject, map, Observable } from "rxjs";
import type { Token } from "../logic/Tokens";
import type { ClassName } from "../utils/Names";
import { readJavadoc } from "./JavadocStorage";

export type JavadocString = string;

export interface JavadocData {
    classes: Partial<Record<ClassName, {
        javadoc: JavadocString | null;
        methods: Record<string, JavadocString>;
        fields: Record<string, JavadocString>;
    }>>;
}

export const javadocData = new BehaviorSubject<JavadocData>({
    classes: {}
});

// Holds the currently active token for which Javadoc is being edited
export const activeJavadocToken = new BehaviorSubject<Token | null>(null);

export function setTokenJavadoc(token: Token, javadoc: JavadocString | undefined) {
    const data = javadocData.getValue();
    const classEntry = data.classes[token.className] || { javadoc: null, methods: {}, fields: {} };

    if (token.type === 'class') {
        classEntry.javadoc = javadoc ?? null;
    } else if (token.type === 'method') {
        if (javadoc === undefined) {
            delete classEntry.methods[token.name + token.descriptor];
        } else {
            classEntry.methods[token.name + token.descriptor] = javadoc;
        }
    } else if (token.type === 'field') {
        if (javadoc === undefined) {
            delete classEntry.fields[token.name + token.descriptor];
        } else {
            classEntry.fields[token.name + token.descriptor] = javadoc;
        }
    }

    data.classes[token.className] = classEntry;
    javadocData.next(data);
    console.log("Updated Javadoc data:", data);
}

export async function refreshJavadocDataForClass(className: ClassName) {
    const data = await readJavadoc(className);
    const nextData = { ...javadocData.getValue() };

    for (const [className, entry] of Object.entries(data.classes)) {
        nextData.classes[className as ClassName] = entry;
    }

    javadocData.next(nextData);
}

export function observeJavadocForToken(token: Token): Observable<JavadocString | null> {
    return javadocData.pipe(
        map(data => {
            return getJavadocForToken(token, data);
        })
    );
}

export function getJavadocForToken(token: Token, javadoc: JavadocData): JavadocString | null {
    switch (token.type) {
        case 'class':
            return javadoc.classes[token.className]?.javadoc || null;
        case 'method':
            return javadoc.classes[token.className]?.methods[token.name + token.descriptor] || null;
        case 'field':
            return javadoc.classes[token.className]?.fields[token.name + token.descriptor] || null;
    }

    return null;
}
