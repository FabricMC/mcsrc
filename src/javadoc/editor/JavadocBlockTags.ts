import { getMarkdownContext } from './JavadocReference';

export interface JavadocBlockTag {
    name: string;
    line: number;
    column: number;
    parameter?: string;
    parameterColumn?: number;
    description: string;
}

/** Reads block tags and their multiline descriptions, excluding Markdown code examples. */
export function readJavadocBlockTags(markdown: string): JavadocBlockTag[] {
    const lines = markdown.split('\n');
    const tags: JavadocBlockTag[] = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const match = /^ {0,3}@(\w+)(?=[ \t]|$)/.exec(line);
        const column = line.indexOf('@') + 1;
        if (!match || getMarkdownContext(markdown, { lineNumber: index + 1, column: column + 1 }).inCode) {
            const previous = tags.at(-1);
            if (previous) {
                previous.description += '\n' + line;
            }
            continue;
        }
        const tag: JavadocBlockTag = {
            name: match[1], line: index + 1, column,
            description: line.slice(match[0].length).trim(),
        };
        if (tag.name === 'param') {
            const parameter = /^[ \t]+(\S+)/.exec(line.slice(match[0].length));
            if (parameter) {
                tag.parameter = parameter[1];
                tag.parameterColumn = match[0].length + parameter[0].indexOf(parameter[1]) + 1;
                tag.description = line.slice(tag.parameterColumn - 1 + tag.parameter.length).trim();
            }
        }
        tags.push(tag);
    }
    return tags;
}
