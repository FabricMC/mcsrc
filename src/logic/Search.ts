export function getCamelCaseAcronym(str: string): string {
  return str.replace(/[^A-Z]/g, "");
}

export function matchesCamelCase(className: string, query: string): boolean {
  const acronym = getCamelCaseAcronym(className);
  return acronym.toLowerCase().startsWith(query.toLowerCase());
}

// Vibe coded mess that no one other than copilot or should read or touch :D
export function performSearch(query: string, classes: string[]): string[] {
  if (query.length === 0) {
    return [];
  }

  const lowerQuery = query.toLowerCase();

  const results = classes
    .filter((className) => {
      const simpleClassName = className.split("/").pop() || className;
      const lowerSimpleName = simpleClassName.toLowerCase();

      return lowerSimpleName.includes(lowerQuery) || matchesCamelCase(simpleClassName, query);
    })
    .map((className) => {
      const simpleClassName = className.split("/").pop() || className;
      const lowerSimpleName = simpleClassName.toLowerCase();

      let score = 0;

      if (lowerSimpleName === lowerQuery) {
        score = 0;
      } else if (lowerSimpleName.startsWith(lowerQuery)) {
        score = 1;
      } else if (getCamelCaseAcronym(simpleClassName).toLowerCase() === lowerQuery) {
        score = 2;
      } else if (matchesCamelCase(simpleClassName, query)) {
        score = 3;
      } else {
        score = 4 + lowerSimpleName.indexOf(lowerQuery);
      }

      return { className, score };
    })
    .sort((a, b) => {
      if (a.score !== b.score) {
        return a.score - b.score;
      }

      const aSimple = a.className.split("/").pop() || a.className;
      const bSimple = b.className.split("/").pop() || b.className;
      if (aSimple.length !== bSimple.length) {
        return aSimple.length - bSimple.length;
      }

      return aSimple.localeCompare(bSimple);
    })
    .slice(0, 100)
    .map((result) => result.className);

  return results;
}
