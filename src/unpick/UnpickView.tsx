import { ProductFilled } from "@ant-design/icons";
import { Button, Splitter, Tooltip } from "antd";
import { lazy, Suspense, type PropsWithChildren } from "react";
import { BehaviorSubject, distinctUntilChanged } from "rxjs";
import { activeJavadocFile } from "../javadoc/JavadocState";
import { mobileDrawerOpen } from "../logic/State";
import { useObservable } from "../utils/UseObservable";

const UnpickEditor = lazy(() => import("./UnpickEditor"));

const unpickEditorOpen = new BehaviorSubject(false);
// Autosave re-emits the current source to refresh the decompiled code.
activeJavadocFile.pipe(distinctUntilChanged()).subscribe(() => unpickEditorOpen.next(false));

export function UnpickEditorButton() {
    const source = useObservable(activeJavadocFile);
    const open = useObservable(unpickEditorOpen);
    if (source?.kind === "file" || !source?.unpickFiles) return null;

    const disabled = !source.runtimeLibraries;
    let title = open ? "Hide Unpick editor" : "Show Unpick editor";
    if (disabled) {
        title = source.kind === "server"
            ? "Unpick is disabled because the annotater server did not provide runtime JARs."
            : "Unpick is disabled because runtime JARs are unavailable. Run ./gradlew prepareMcSrc and reopen the project.";
    }

    return (
        <Tooltip title={title} trigger={["hover", "focus"]}>
            <Button
                type={open ? "primary" : "default"}
                danger={disabled}
                icon={<ProductFilled />}
                aria-label="Unpick editor"
                aria-disabled={disabled}
                aria-pressed={open}
                onClick={() => {
                    if (disabled) return;
                    unpickEditorOpen.next(!unpickEditorOpen.value);
                    mobileDrawerOpen.next(false);
                }}
            />
        </Tooltip>
    );
}

export function UnpickSplitView({ children }: PropsWithChildren) {
    const source = useObservable(activeJavadocFile);
    const open = useObservable(unpickEditorOpen);
    if (source?.kind === "file" || !source?.unpickFiles || !source.runtimeLibraries) return children;

    return (
        <Splitter orientation="vertical">
            <Splitter.Panel defaultSize="50%" min="20%" style={{ minHeight: 0, overflow: "visible" }}>
                {children}
            </Splitter.Panel>
            {open && (
                <Splitter.Panel min="20%" style={{ minHeight: 0, overflow: "visible" }}>
                    <Suspense fallback={null}>
                        <UnpickEditor source={source} store={source.unpickFiles} />
                    </Suspense>
                </Splitter.Panel>
            )}
        </Splitter>
    );
}
