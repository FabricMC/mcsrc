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
    if (source?.kind !== "directory" || !source.unpickDirectory) return null;

    return (
        <Tooltip title={open ? "Hide Unpick editor" : "Show Unpick editor"}>
            <Button
                type={open ? "primary" : "default"}
                icon={<ProductFilled />}
                aria-label="Unpick editor"
                aria-pressed={open}
                onClick={() => {
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
    if (source?.kind !== "directory" || !source.unpickDirectory) return children;

    return (
        <Splitter orientation="vertical">
            <Splitter.Panel defaultSize="50%" min="20%">{children}</Splitter.Panel>
            {open && (
                <Splitter.Panel min="20%">
                    <Suspense fallback={null}>
                        <UnpickEditor source={source} directory={source.unpickDirectory} />
                    </Suspense>
                </Splitter.Panel>
            )}
        </Splitter>
    );
}
