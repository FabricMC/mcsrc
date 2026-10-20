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

export function performSearch<T>(query: string, classes: T[], getSearchText: (item: T) => string = item => String(item)): T[] {
    const terms = query.match(/\S+/g) ?? [];
    if (terms.length === 0) {
        return [];
    }

    const results: { className: T; simpleClassName: string; score: number }[] = [];
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
