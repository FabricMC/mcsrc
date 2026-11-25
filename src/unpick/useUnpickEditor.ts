import { useMonaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { BehaviorSubject, concatMap, debounce, firstValueFrom, fromEvent, merge, Subject, timer } from "rxjs";
import { javadocRuntimeLibraries } from "../javadoc/JavadocLibraryClasses";
import { activeJavadocFile } from "../javadoc/JavadocState";
import { getUnpickValidationBridge, type JavadocDirectorySource } from "../javadoc/JavadocStorage";
import { minecraftJar, type MinecraftJar } from "../logic/MinecraftApi";
import { selectedMinecraftVersion } from "../logic/State";
import { useObservable } from "../utils/UseObservable";
import { validateUnpickDefinitions, type UnpickDefinition } from "./UnpickDefinitions";
import { changeUnpickFile, readUnpickFiles } from "./UnpickFiles";
import { useUnpickSymbolCompletion } from "./useUnpickSymbolCompletion";

const AUTOSAVE_DELAY = 2000;
const MARKER_OWNER = "unpick-validation";
const operations = new Subject<() => Promise<void>>();
operations.pipe(concatMap(operation => operation())).subscribe();

interface ValidationError {
    message: string;
    location?: {
        file: UnpickDefinition;
        lineNumber: number | null;
        columnNumber: number | null;
    };
}

function syntaxMarkers(
    monaco: typeof import("monaco-editor"),
    model: editor.ITextModel,
    file: UnpickDefinition | undefined,
    error: ValidationError | undefined,
): editor.IMarkerData[] {
    const location = error?.location;
    if (!error || !location || location.lineNumber === null
        || file?.path !== location.file.path || file.content !== location.file.content) return [];

    const line = Math.max(1, Math.min(location.lineNumber, model.getLineCount()));
    const maxColumn = model.getLineMaxColumn(line);
    let startColumn = model.getLineFirstNonWhitespaceColumn(line) || 1;
    let endColumn = maxColumn;
    if (location.columnNumber !== null) {
        // The parser may report EOF just past the last character.
        startColumn = Math.max(1, Math.min(location.columnNumber, maxColumn - 1));
        const word = model.getWordAtPosition({ lineNumber: line, column: startColumn });
        endColumn = Math.min(maxColumn, Math.max(startColumn + 1, word?.endColumn ?? startColumn));
    }

    return [{
        startLineNumber: line,
        startColumn,
        endLineNumber: line,
        endColumn,
        message: error.message,
        severity: monaco.MarkerSeverity.Error,
        source: "Unpick",
    }];
}

export function useUnpickEditor(source: JavadocDirectorySource, directory: FileSystemDirectoryHandle) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const [validationError, setValidationError] = useState<ValidationError>();
    const [files, setFiles] = useState<UnpickDefinition[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>();
    const [newName, setNewName] = useState<string>();
    const [model, setModel] = useState<editor.ITextModel | null>(null);
    const monaco = useMonaco();
    useUnpickSymbolCompletion(monaco, model);
    const [edits] = useState(() => new Subject<() => void>());
    const [flushEdits] = useState(() => new Subject<void>());
    const [savedContents] = useState(() => new BehaviorSubject(new Map<string, string>()));
    const [failedWrites] = useState(() => new BehaviorSubject(new Map<string, string>()));
    const diskContents = useObservable(savedContents);
    const saveError = useObservable(failedWrites).values().next().value;
    const loadedJar = useRef<MinecraftJar>(undefined);
    const selected = files.find(file => file.path === selectedPath);
    const unsaved = !!saveError || files.some(file => file.content !== diskContents.get(file.path));

    useEffect(() => {
        if (!unsaved) return;
        const subscription = fromEvent<BeforeUnloadEvent>(window, "beforeunload").subscribe(event => event.preventDefault());
        return () => subscription.unsubscribe();
    }, [unsaved]);

    useEffect(() => {
        if (!monaco || !model || model.isDisposed()) return;
        monaco.editor.setModelMarkers(model, MARKER_OWNER, syntaxMarkers(monaco, model, selected, validationError));
    }, [monaco, model, selected, validationError]);

    useEffect(() => {
        const subscription = edits.pipe(
            debounce(() => merge(timer(AUTOSAVE_DELAY), flushEdits)),
        ).subscribe(save => save());
        return () => {
            flushEdits.next();
            subscription.unsubscribe();
        };
    }, [edits, flushEdits]);

    const queue = (action: () => Promise<void>, finished?: () => void) => {
        operations.next(async () => {
            setError(undefined);
            try {
                await action();
            } catch (error) {
                setError(error instanceof Error ? error.message : String(error));
            } finally {
                finished?.();
            }
        });
    };

    const run = (action: () => Promise<void>) => {
        flushEdits.next();
        setBusy(true);
        queue(action, () => setBusy(false));
    };

    const validate = async (snapshot?: UnpickDefinition[]) => {
        const definitions = snapshot ?? await readUnpickFiles(directory);
        if (activeJavadocFile.value !== source) return;
        try {
            if (definitions.length > 0) {
                const currentJar = loadedJar.current;
                if (!currentJar || currentJar.version !== selectedMinecraftVersion.value) {
                    setValidationError(undefined);
                    return;
                }

                const libraries = await firstValueFrom(javadocRuntimeLibraries);
                const bridge = await getUnpickValidationBridge();
                const syntaxError = await validateUnpickDefinitions(bridge, definitions, currentJar.jar, libraries);
                if (syntaxError) {
                    const { definitionIndex, lineNumber, columnNumber, message } = syntaxError;
                    const file = definitionIndex === null ? undefined : definitions[definitionIndex];
                    setValidationError(file
                        ? { message: `${file.path}: ${message}`, location: { file, lineNumber, columnNumber } }
                        : { message });
                    return;
                }
            }
            setValidationError(undefined);
        } catch (error) {
            // Keep the last valid definitions active while the user fixes the files on disk.
            setValidationError({ message: error instanceof Error ? error.message : String(error) });
            return;
        }

        if (!source.runtimeLibraries || activeJavadocFile.value !== source) return;
        const active = source.unpick?.definitions ?? [];
        if (definitions.length === active.length && definitions.every((file, index) =>
            file.path === active[index].path && file.content === active[index].content)) return;

        source.unpick = definitions.length ? { definitions, id: crypto.randomUUID() } : undefined;
        // Keep the same mapping source so any open Javadoc drafts remain attached.
        activeJavadocFile.next(source);
    };

    const readDirectory = async () => {
        const latest = await readUnpickFiles(directory);
        failedWrites.next(new Map());
        savedContents.next(new Map(latest.map(file => [file.path, file.content])));
        setFiles(latest);
        setSelectedPath(path => latest.some(file => file.path === path) ? path : latest[0]?.path);
        await validate(latest);
    };

    const refresh = () => run(async () => {
        if (failedWrites.value.size === 0) await readDirectory();
    });
    const discardDrafts = () => run(readDirectory);

    const loadDirectory = useEffectEvent(refresh);
    const onJarLoaded = useEffectEvent((jar: MinecraftJar) => {
        loadedJar.current = jar;
        if (jar.version === selectedMinecraftVersion.value && savedContents.value.size > 0) {
            queue(() => validate());
        }
    });
    useEffect(() => {
        const subscription = minecraftJar.subscribe(jar => onJarLoaded(jar));
        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        loadDirectory();
    }, [directory]);

    const clearSaveError = (path: string) => {
        if (!failedWrites.value.has(path)) return;
        const remaining = new Map(failedWrites.value);
        remaining.delete(path);
        failedWrites.next(remaining);
    };

    const saveEdit = (path: string, content: string) => {
        setFiles(files => files.map(file => file.path === path ? { path, content } : file));
        edits.next(() => queue(async () => {
            const previous = savedContents.value.get(path);
            if (content !== previous) {
                try {
                    await changeUnpickFile(directory, path, previous, content);
                } catch (error) {
                    failedWrites.next(new Map(failedWrites.value).set(path, error instanceof Error ? error.message : String(error)));
                    return;
                }
                savedContents.next(new Map(savedContents.value).set(path, content));
            }
            clearSaveError(path);
            if (content !== previous) await validate();
        }));
    };

    const createFile = () => run(async () => {
        const name = newName?.trim().replace(/\.unpick$/, "");
        if (!name || name === "." || name === ".." || /[/\\:]/.test(name)) {
            throw new Error("Enter a file name without a directory path.");
        }
        const path = `${name}.unpick`;
        const content = "unpick v4\n";
        await changeUnpickFile(directory, path, undefined, content);
        savedContents.next(new Map(savedContents.value).set(path, content));
        setFiles(files => [...files, { path, content }].sort((a, b) => a.path.localeCompare(b.path)));
        setNewName(undefined);
        setSelectedPath(path);
        await validate();
    });

    const deleteFile = (path: string) => run(async () => {
        const previous = savedContents.value.get(path);
        await changeUnpickFile(directory, path, previous, undefined);
        clearSaveError(path);
        const remaining = new Map(savedContents.value);
        remaining.delete(path);
        savedContents.next(remaining);
        setFiles(files => files.filter(file => file.path !== path));
        setSelectedPath(current => current === path ? files.find(file => file.path !== path)?.path : current);
        await validate();
    });

    const selectFile = (path: string) => {
        flushEdits.next();
        setSelectedPath(path);
        setNewName(undefined);
    };

    const invalidFile = validationError?.location?.file;
    return {
        busy,
        error,
        saveError,
        validationMessage: validationError?.message,
        files: files.map(file => ({
            path: file.path,
            invalid: file.path === invalidFile?.path && file.content === invalidFile.content,
            unsaved: diskContents.get(file.path) !== file.content,
        })),
        selected,
        newName,
        setNewName,
        setModel,
        selectFile,
        refresh,
        discardDrafts,
        saveEdit,
        createFile,
        deleteFile,
    };
}
