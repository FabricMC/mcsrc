import { BehaviorSubject } from "rxjs";
import type { JavadocSource, JavadocUnpickSource } from "./JavadocStorage";

export const activeJavadocFile = new BehaviorSubject<JavadocSource | null>(null);

type JavadocDecompileState = JavadocUnpickSource & { kind?: JavadocSource["kind"] };

export function javadocAltersDecompileOutput(javadoc: JavadocDecompileState | null | undefined): boolean {
    return (javadoc?.runtimeLibraries?.files.length ?? 0) > 0 || (javadoc?.unpick?.definitions.length ?? 0) > 0;
}
