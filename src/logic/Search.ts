import type { StringData } from "../workers/jar-index/types";

export function getCamelCaseAcronym(str: string): string {
    return str.replace(/[^A-Z]/g, '');
}

export function matchesCamelCase(className: string, query: string): boolean {
    const acronym = getCamelCaseAcronym(className);
    return acronym.toLowerCase().startsWith(query.toLowerCase());
}

function matchesCamelCasePrefixes(className: string, query: string): boolean {
    const queryWords = query.match(/[A-Z][^A-Z]*/g);
    if (!queryWords || queryWords.join('') !== query) {
        return false;
    }

    const classWords = className.match(/[A-Z][^A-Z]*/g) ?? [];
    if (queryWords.length > classWords.length) {
        return false;
    }

    return queryWords.every((word, index) => classWords[index].startsWith(word));
}

function getMatchScore(simpleClassName: string, query: string): number | undefined {
    const lowerName = simpleClassName.toLowerCase();
    const lowerQuery = query.toLowerCase();

    if (lowerName === lowerQuery) {
        return 0;
    }
    if (lowerName.startsWith(lowerQuery)) {
        return 1;
    }
    if (getCamelCaseAcronym(simpleClassName).toLowerCase() === lowerQuery) {
        return 2;
    }
    if (matchesCamelCase(simpleClassName, query)) {
        return 3;
    }
    if (matchesCamelCasePrefixes(simpleClassName, query)) {
        return 4;
    }

    const position = lowerName.indexOf(lowerQuery);
    if (position !== -1) {
        return 5 + position;
    }
    return undefined;
}

const ESCAPES: Record<string, string | undefined> = {
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\f': '\\f',
    '\r': '\\r',
    '\\': '\\\\',
};

// works exactly like vineflower's escaping
export function escapeStringLiteral(text: string, escapeQuotes: boolean = true): string {
    return Array.from(text, character => {
        const escaped = ESCAPES[character];
        if (escaped) return escaped;
        if (escapeQuotes && character === '"') return '\\"';

        const code = character.charCodeAt(0);
        return code <= 0x1f || (code >= 0x7f && code <= 0x9f)
            ? `\\u${code.toString(16).padStart(4, '0')}`
            : character;
    }).join('');
}

export function performLiteralSearch(query: string, values: StringData[]): StringData[] {
    if (query.length === 0) {
        return [];
    }

    const lowerQuery = query.toLowerCase();

    return values
        .map(value => ({ value, escaped: escapeStringLiteral(value[1], false).toLowerCase() }))
        .filter(value => value.escaped.includes(lowerQuery))
        .map(({ value, escaped }) => {
            const index = escaped.indexOf(lowerQuery);
            const score = escaped === lowerQuery ? 0 : escaped.startsWith(lowerQuery) ? 1 : 2 + index;
            return { value, escaped, score };
        })
        .sort((a, b) => a.score - b.score || a.escaped.localeCompare(b.escaped))
        .slice(0, 100)
        .map(result => result.value);
}

export function performSearch<T>(query: string, classes: T[], getSearchText: (item: T) => string = item => String(item)): T[] {
    const terms = query.match(/\S+/g) ?? [];
    if (terms.length === 0) {
        return [];
    }

    const results: { className: T; simpleClassName: string; score: number; }[] = [];
    for (const className of classes) {
        const searchText = getSearchText(className);
        const simpleClassName = searchText.split('/').pop() || searchText;
        let score = 0;
        let matchesAllTerms = true;

        for (const term of terms) {
            const termScore = getMatchScore(simpleClassName, term);
            if (termScore === undefined) {
                matchesAllTerms = false;
                break;
            }
            score += termScore;
        }

        if (matchesAllTerms) {
            results.push({ className, simpleClassName, score });
        }
    }

    return results
        .sort((a, b) => {
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            if (a.simpleClassName.length !== b.simpleClassName.length) {
                return a.simpleClassName.length - b.simpleClassName.length;
            }
            return a.simpleClassName.localeCompare(b.simpleClassName);
        })
        .slice(0, 100)
        .map(result => result.className);
}
