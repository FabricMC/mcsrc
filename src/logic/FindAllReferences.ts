import { BehaviorSubject, combineLatest, distinctUntilChanged, from, map, of, shareReplay, startWith, switchMap } from "rxjs";
import { jarIndex } from "../workers/jar-index/client";
import { openCodeTab } from "./tabs";
import { referencesQuery } from "./State";
import type { Token } from "./Tokens";
import type { DecompileResult } from "../workers/decompile/types";
import type { ReferenceKey, ReferenceString } from "../workers/jar-index/types";
import { toClassFilePath, toClassName, type ClassName } from "../utils/Names";
import { hierarchyNavigation } from './Inheritance';
import { includeMethodHierarchy } from './Settings';

export const methodReferenceKeys = combineLatest([referencesQuery, hierarchyNavigation]).pipe(
    map(([query, navigation]) => {
        if (!query || getQueryType(query) !== 'method' || !navigation) return [];
        const [owner, name, descriptor] = query.split(':');
        return navigation.index.methodHierarchy(toClassName(owner), name, descriptor);
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
);

export interface ReferenceMatch {
    reference: ReferenceString;
    queries: ReferenceKey[];
}

export const referenceResults = jarIndex.pipe(
    switchMap(index => combineLatest([referencesQuery, includeMethodHierarchy.observable, hierarchyNavigation]).pipe(
        map(([query, includeHierarchy, navigation]): ReferenceKey[] => {
            if (!query) return [];
            if (includeHierarchy && getQueryType(query) === 'method') {
                if (!navigation || navigation.jarName !== index.minecraftJar.jar.name) return [];
                const [owner, name, descriptor] = query.split(':');
                return navigation.index.methodHierarchy(toClassName(owner), name, descriptor);
            }
            return [query];
        }),
        distinctUntilChanged((previous, current) => previous.length === current.length && previous.every((key, position) => key === current[position])),
        switchMap(keys => {
            if (keys.length === 0) return of<ReferenceMatch[]>([]);
            return from(Promise.all(keys.map(async key => ({ key, references: await index.getReference(key) })))).pipe(
                map(results => {
                    const matches = new Map<ReferenceString, ReferenceMatch>();
                    for (const { key, references } of results) {
                        for (const reference of references) {
                            const match = matches.get(reference) ?? { reference, queries: [] };
                            match.queries.push(key);
                            matches.set(reference, match);
                        }
                    }
                    return [...matches.values()];
                }),
                startWith<ReferenceMatch[]>([]),
            );
        }),
    )),
    shareReplay({ bufferSize: 1, refCount: true }),
);

export const isViewingReferences = referencesQuery.pipe(
    map((query) => query.length > 0)
);

// Format the reference string to be displayed by the user
export function formatReference(reference: ReferenceString): string {
    if (reference.startsWith("m:")) {
        const parts = reference.slice(2).split(":");
        return `${parts[1]}${parts[2]}`;
    }
    if (reference.startsWith("f:")) {
        const parts = reference.slice(2).split(":");
        return parts[1];
    }
    if (reference.startsWith("c:")) {
        return reference.slice(2);
    }
    return reference;
}

export function formatReferenceQuery(query: ReferenceKey): string {
    const type = getQueryType(query);

    switch (type) {
        case "class":
            return query.split("/").pop() || query;
        case "method": {
            const parts = query.split(":");
            const className = parts[0].split("/").pop() || parts[0];
            return `${className}.${parts[1]}${parts[2]}`;
        }
        case "field": {
            const parts = query.split(":");
            const className = parts[0].split("/").pop() || parts[0];
            return `${className}.${parts[1]}`;
        }
    }
}

function getQueryType(query: ReferenceKey): "class" | "method" | "field" {
    if (query.includes(":")) {
        const parts = query.split(":");
        if (parts[2].includes("(")) {
            return "method";
        } else {
            return "field";
        }
    }
    return "class";
}

interface ReferenceNavigation {
    // The class to navigate to
    className: ClassName;
    // The reference being navigated to
    query: ReferenceKey;
    queries: ReferenceKey[];
    // The location of where the reference is found
    reference: ReferenceString;
}

export const nextReferenceNavigation = new BehaviorSubject<ReferenceNavigation | undefined>(undefined);

export function goToReference(query: ReferenceKey, reference: ReferenceString, queries: ReferenceKey[] = [query]) {
    const className = toClassName(reference.slice(2).split(":")[0].split('$')[0]);
    openCodeTab(toClassFilePath(className));

    if (reference.startsWith("c:")) {
        // Nothing to jump to
        return;
    }

    nextReferenceNavigation.next({ className, query, queries, reference });
}

export function getNextJumpToken(decompileResult: DecompileResult): Token | undefined {
    const referenceNavigation = nextReferenceNavigation.getValue();

    if (!referenceNavigation) {
        return undefined;
    }

    const { className, query, queries, reference } = referenceNavigation;

    if (decompileResult.className != className) {
        console.log("Decompile result class does not match reference navigation class", decompileResult.className, className);
        return undefined;
    }

    nextReferenceNavigation.next(undefined);

    // This works by first finding the token that matches the reference we are looking for.
    // We can then find the token that matches the declaration of the query we are looking for.
    // This allows us to jump to the first reference of the query after the reference that was selected.

    let referenceTokenIndex: number | null = null;

    { // First find the reference token
        const parts = reference.slice(2).split(":");
        const classname = toClassName(parts[0]);
        const name = parts[1];
        const descriptor = parts[2];
        const expectedType = reference.startsWith("m:") ? "method" : "field";

        for (let i = 0; i < decompileResult.tokens.length; i++) {
            const token = decompileResult.tokens[i];

            if (!token.declaration) {
                // We only want to jump to the declaration
                continue;
            }

            if (token.type != expectedType) {
                continue;
            }

            if (token.className == classname && token.name == name && token.descriptor == descriptor) {
                if (token.type == "field") {
                    // For fields, just return the reference as there is only one declaration
                    return token;
                }

                if (!query.includes(":")) {
                    // If the query is just a class, we can't find a method declaration for it
                    // Is this even possible?
                    return undefined;
                }

                // For methods we can keep looking for a token that matches the query after this
                referenceTokenIndex = i;
                break;
            }
        }
    }

    if (referenceTokenIndex === null) {
        // Synthetic methods and static initializers may not have declarations in
        // decompiled source. Vineflower instead places their contents directly in
        // a lambda or initializer, so locate the referenced token in the class.
        const token = findReferenceToken(decompileResult.tokens, queries);
        if (!token) {
            console.log("Could not find token for", query);
        }
        return token;
    }

    const remainingTokens = decompileResult.tokens.slice(referenceTokenIndex + 1);
    const nextDeclaration = remainingTokens.findIndex(token => token.declaration && (token.type === 'method' || token.type === 'class'));
    const bodyTokens = nextDeclaration < 0 ? remainingTokens : remainingTokens.slice(0, nextDeclaration);
    const token = findReferenceToken(bodyTokens, queries);
    if (token) return token;

    // Give up if we reach another declaration, it means we didnt find it
    // Just return the declaration that supposedly contains the reference
    console.log("Could not find token for", query);
    return decompileResult.tokens[referenceTokenIndex];
}

function findReferenceToken(tokens: Token[], queries: ReferenceKey[]): Token | undefined {
    return tokens.find(token => queries.some(query => {
        const parts = query.split(":");
        const className = toClassName(parts[0]);
        const name = parts[1];
        const descriptor = parts[2];
        const queryType = getQueryType(query);
        if (token.declaration) {
            return false;
        }

        if (queryType == "method") {
            if (name == "<init>") {
                return token.type == "class" && token.className == className;
            }

            return token.type == "method"
                && token.className == className
                && token.name == name
                && token.descriptor == descriptor;
        }

        return token.type == "field"
            && token.className == className
            && token.name == name
            && token.descriptor == descriptor;
    }));
}
