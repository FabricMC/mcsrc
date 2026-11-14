import { BehaviorSubject } from "rxjs";
import type { JavadocDirectorySource, JavadocFileSource, JavadocServerSource, JavadocSource } from "./JavadocStorage";

export const activeJavadocFile = new BehaviorSubject<JavadocSource | null>(null);

type JavadocDecompileState = Pick<JavadocFileSource, "kind">
    | Pick<JavadocDirectorySource, "kind" | "runtimeLibraries" | "unpick">
    | Pick<JavadocServerSource, "kind">;

export function javadocAltersDecompileOutput(javadoc: JavadocDecompileState | null | undefined): boolean {
    if (javadoc?.kind !== "directory") return false;
    return (javadoc.runtimeLibraries?.files.length ?? 0) > 0 || (javadoc.unpick?.definitions.length ?? 0) > 0;
}
