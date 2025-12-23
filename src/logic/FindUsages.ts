import { BehaviorSubject, combineLatest, distinctUntilChanged, from, map, Observable, switchMap, throttleTime } from "rxjs";
import { usageIndex, type UsageKey, type UsageString } from "../workers/UsageIndex";
import { openTab } from "./Tabs";
import type { DecompileResult } from "./Decompiler";
import type { Token } from "./Tokens";

export const usageQuery = new BehaviorSubject("");

export const useageResults = usageQuery
    .pipe(
        throttleTime(200),
        distinctUntilChanged(),
        switchMap((query) => {
            if (!query) {
                return from([[]]);
            }
            return usageIndex.pipe(
                switchMap((index) => from(index.getUsage(query)))
            );
        })
    );

export const isViewingUsages = usageQuery.pipe(
    map((query) => query.length > 0)
);

// Format the usage string to be displayed by the user
export function formatUsage(usage: UsageString): string {
    if (usage.startsWith("m:")) {
        const parts = usage.slice(2).split(":");
        return `${parts[1]}${parts[2]}`;
    }
    if (usage.startsWith("f:")) {
        const parts = usage.slice(2).split(":");
        return parts[1];
    }
    if (usage.startsWith("c:")) {
        return usage.slice(2);
    }
    return usage;
}

export function formatUsageQuery(query: UsageKey): string {
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

function getQueryType(query: UsageKey): "class" | "method" | "field" {
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

interface UsageNavigation {
    // The class to navigate to
    className: string;
    // The usage being navigated to
    query: UsageKey;
    // The location of where the usage is found
    usage: UsageString;
}

export const nextUsageNavigation = new BehaviorSubject<UsageNavigation | undefined>(undefined);

export function goToUsage(query: UsageKey, usage: UsageString) {
    const className = usage.slice(2).split(":")[0];
    openTab(className + ".class");

    if (usage.startsWith("c:")) {
        // Nothing to jump to
        return;
    }

    nextUsageNavigation.next({ className, query, usage });
}

export function getNextJumpToken(decompileResult: DecompileResult): Token | undefined {
    const usageNavigation = nextUsageNavigation.getValue();

    if (!usageNavigation) {
        return undefined;
    }

    const { className, query, usage } = usageNavigation;

    if (decompileResult.className != className + ".class") {
        console.log("Decompile result class does not match usage navigation class", decompileResult.className, className);
        return undefined;
    }

    nextUsageNavigation.next(undefined);

    // This works by first finding the token that matches the usage we are looking for.
    // We can then find the token that matches the declaration of the query we are looking for.
    // This allows us to jump to the first usage of the query after the usage that was selected.

    let usageTokenIndex: number | null = null;

    { // First find the usage token
        const parts = usage.slice(2).split(":");
        const classname = parts[0];
        const name = parts[1];
        const descriptor = parts[2];
        const expectedType = usage.startsWith("m:") ? "method" : "field";

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
                    // For fields, just return the usage as there is only one declaration
                    return token;
                }

                if (!query.includes(":")) {
                    // If the query is just a class, we can't find a method declaration for it
                    // Is this even possible?
                    return undefined;
                }

                // For methods we can keep looking for a token that matches the query after this
                usageTokenIndex = i;
                break;
            }
        }
    }

    if (!usageTokenIndex) {
        console.log("Could not find usage token for", usage);
        return undefined;
    }

    const parts = query.split(":");
    const name = parts[1];
    const descriptor = parts[2];
    const queryType = getQueryType(query);

    // Next continue searching from the usage token index to find the actual useage
    for (let i = usageTokenIndex + 1; i < decompileResult.tokens.length; i++) {
        const token = decompileResult.tokens[i];

        // Special case for constructor usage
        if (name == "<init>" && token.type == "class" && token.className == parts[0]) {
            return token;
        }

        if (queryType == "method" && token.type == "method" && token.name == name && token.descriptor == descriptor) {
            return token;
        }

        if (queryType == "field" && token.type == "field" && token.name == name) {
            return token;
        }
    }

    // Give up if we reach another declaration, it means we didnt find it
    // Just return the declaration that supposedly contains the usage
    console.log("Could not find token for", query);
    return decompileResult.tokens[usageTokenIndex];
}