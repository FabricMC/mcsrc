import type { Token } from "../logic/Tokens";
import type { ClassName } from "../utils/Names";
import type { JavadocData, JavadocString } from "./Javadoc";

export async function readJavadoc(_className: ClassName): Promise<JavadocData> {
    return { classes: {} };
}

export async function writeJavadoc(_token: Token, _javadoc: JavadocString): Promise<void> {
    console.log(`Writing Javadoc for token: ${_token.className} - ${_token.className} - ${_token.declaration}`);
}
