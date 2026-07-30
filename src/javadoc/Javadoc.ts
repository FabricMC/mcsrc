import { BehaviorSubject, map, Observable } from "rxjs";
import type { Token } from "../logic/Tokens";
import type { ClassName } from "../utils/Names";
import { writeJavadocFile, type JavadocFile } from "./JavadocStorage";

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

export const activeJavadocFile = new BehaviorSubject<JavadocFile | null>(null);
export const javadocModeEnabled = activeJavadocFile.pipe(map(file => file !== null));
export const activeJavadocToken = new BehaviorSubject<Token | null>(null);

export function activateJavadocFile(file: JavadocFile, data: JavadocData) {
    javadocData.next(data);
    activeJavadocFile.next(file);
}

export function withTokenJavadoc(
    data: JavadocData,
    token: Token,
    javadoc: JavadocString | undefined,
): JavadocData {
    const existing = data.classes[token.className];
    const classEntry = {
        javadoc: existing?.javadoc ?? null,
        methods: { ...existing?.methods },
        fields: { ...existing?.fields },
    };
    const value = javadoc || undefined;

    if (token.type === 'class') {
        classEntry.javadoc = value ?? null;
    } else if (token.type === 'method') {
        if (value === undefined) {
            delete classEntry.methods[memberKey(token.name, token.descriptor)];
        } else {
            classEntry.methods[memberKey(token.name, token.descriptor)] = value;
        }
    } else if (token.type === 'field') {
        if (value === undefined) {
            delete classEntry.fields[memberKey(token.name, token.descriptor)];
        } else {
            classEntry.fields[memberKey(token.name, token.descriptor)] = value;
        }
    }

    const classes = { ...data.classes };

    if (classEntry.javadoc || Object.keys(classEntry.methods).length || Object.keys(classEntry.fields).length) {
        classes[token.className] = classEntry;
    } else {
        delete classes[token.className];
    }

    return { classes };
}

export async function saveTokenJavadoc(token: Token, javadoc: JavadocString | undefined) {
    const file = activeJavadocFile.value;
    if (!file) throw new Error("No Javadoc mapping file selected");

    const nextData = withTokenJavadoc(javadocData.value, token, javadoc);
    await writeJavadocFile(file, nextData);
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
            return javadoc.classes[token.className]?.methods[memberKey(token.name, token.descriptor)] || null;
        case 'field':
            return javadoc.classes[token.className]?.fields[memberKey(token.name, token.descriptor)] || null;
    }

    return null;
}

function memberKey(name: string, descriptor: string): string {
    return `${name}\0${descriptor}`;
}
