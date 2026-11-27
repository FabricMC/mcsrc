import type { editor } from "monaco-editor";
import { useEffect, useMemo } from "react";
import type { ClassMember } from "../../java/build/generated/teavm/js/mcsrc.js";
import { javadocRuntimeLibraries } from "../javadoc/JavadocLibraryClasses";
import { readClassMembers } from "../javadoc/JavadocStorage";
import type { RuntimeLibraries } from "../javadoc/RuntimeLibraries";
import { minecraftJar } from "../logic/MinecraftApi";
import { selectedFile, selectedMinecraftVersion } from "../logic/State";
import type { Jar } from "../utils/Jar";
import {
    classNameFromClassFilePath, classNameFromDottedClassName, dottedClassNameFromClassName,
    isClassFilePath, type DottedClassName,
} from "../utils/Names";
import { useObservable } from "../utils/UseObservable";
import { createClassSource } from "./UnpickDefinitions";
import { UNPICK_LANGUAGE } from "./UnpickLanguage";
import { unpickParameterHints } from "./UnpickParameterHints";
import { unpickSymbolCompletionProvider, type UnpickSymbols } from "./UnpickSymbolCompletionProvider";

function unpickSymbols(jar: Jar, libraries: RuntimeLibraries): UnpickSymbols {
    const classSource = createClassSource(jar, libraries);
    const memberCache = new Map<DottedClassName, Promise<ClassMember[]>>();
    let classes: Promise<ReadonlySet<DottedClassName>> | undefined;

    async function loadClasses() {
        const names = new Set(Object.keys(jar.entries).filter(isClassFilePath)
            .map(path => dottedClassNameFromClassName(classNameFromClassFilePath(path))));
        try {
            for (const name of await libraries.getClassNames()) names.add(dottedClassNameFromClassName(name));
        } catch (error) {
            console.warn("Unable to load Unpick library classes", error);
        }
        return names;
    }

    return {
        classes: () => classes ??= loadClasses(),
        members(owner) {
            let members = memberCache.get(owner);
            if (!members) {
                members = classSource(classNameFromDottedClassName(owner))
                    .then(bytes => bytes ? readClassMembers(bytes) : [])
                    .catch(error => {
                        console.warn(`Unable to read Unpick completion members for ${owner}`, error);
                        return [];
                    });
                memberCache.set(owner, members);
            }
            return members;
        },
        currentClass() {
            const file = selectedFile.value;
            return file && jar.entries[file] ? dottedClassNameFromClassName(classNameFromClassFilePath(file)) : undefined;
        },
    };
}

export function useUnpickSymbolCompletion(
    monaco: typeof import("monaco-editor") | null,
    model: editor.ITextModel | null,
) {
    const jar = useObservable(minecraftJar);
    const version = useObservable(selectedMinecraftVersion);
    const libraries = useObservable(javadocRuntimeLibraries);
    const symbols = useMemo(
        () => libraries && jar && jar.version === version ? unpickSymbols(jar.jar, libraries) : undefined,
        [jar, version, libraries],
    );

    useEffect(() => {
        if (!monaco || !model || !symbols) return;
        const completion = monaco.languages.registerCompletionItemProvider(UNPICK_LANGUAGE, unpickSymbolCompletionProvider(model, symbols));
        const hints = monaco.languages.registerInlayHintsProvider(UNPICK_LANGUAGE, unpickParameterHints(model, symbols.members));
        return () => {
            completion.dispose();
            hints.dispose();
        };
    }, [monaco, model, symbols]);
}
