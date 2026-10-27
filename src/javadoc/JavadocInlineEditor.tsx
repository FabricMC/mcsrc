import { Button, Flex, message, theme, Typography } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { editor } from "monaco-editor";
import { animationFrames, map, of, startWith, takeWhile, type Subscription } from "rxjs";
import { getTokenLocation, type Token } from "../logic/Tokens";
import type { DecompileResult } from "../workers/decompile/types";
import { useObservable } from "../utils/UseObservable";
import { activeJavadocToken, getJavadocForToken } from "./Javadoc";
import { getJavadocDraft } from "./JavadocAutosave";
import JavadocMarkdownEditor from "./JavadocMarkdownEditor";

interface InlineHost {
    token: Token;
    domNode: HTMLDivElement;
    resize: (height: number) => void;
    close: () => void;
    dispose: () => void;
}

interface InlineAnimationState {
    height: number;
    opacity: number;
}

function createInlineAnimation(initialHeight: number, onFrame: (state: InlineAnimationState) => void) {
    let animationSubscription: Subscription | undefined;
    let currentState: InlineAnimationState = { height: initialHeight, opacity: 0 };

    return {
        setHeight(height: number) {
            currentState = { ...currentState, height };
            onFrame(currentState);
        },
        animateTo(target: InlineAnimationState, onComplete: () => void) {
            animationSubscription?.unsubscribe();
            const initialState = currentState;
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            const progressUpdates = reducedMotion ? of(1) : animationFrames().pipe(
                map(({ elapsed }) => Math.min(1, elapsed / 150)),
                startWith(0),
                takeWhile(progress => progress < 1, true),
            );

            animationSubscription = progressUpdates.subscribe({
                next: progress => {
                    const easedProgress = 1 - (1 - progress) ** 3;
                    currentState = {
                        height: initialState.height + (target.height - initialState.height) * easedProgress,
                        opacity: initialState.opacity + (target.opacity - initialState.opacity) * easedProgress,
                    };
                    onFrame(currentState);
                },
                complete: onComplete,
            });
        },
        dispose() {
            animationSubscription?.unsubscribe();
        },
    };
}

function createInlineHost(codeEditor: editor.IStandaloneCodeEditor, result: DecompileResult, token: Token, onClosing: () => void): InlineHost {
    const location = getTokenLocation(result, token);
    const domNode = document.createElement("div");
    domNode.style.overflow = "hidden";
    domNode.style.opacity = "0";

    const getDocumentationHeight = () => {
        const documentation = getJavadocForToken(token);
        if (documentation === null) return 0;

        const lineCount = documentation.split("\n").length;
        const lineHeight = codeEditor.getOption(editor.EditorOption.lineHeight);
        return lineCount * lineHeight;
    };
    const updateWidth = () => {
        const layout = codeEditor.getLayoutInfo();
        domNode.style.width = `${Math.max(0, layout.contentWidth - 16)}px`;
        domNode.style.left = `${layout.contentLeft}px`;
    };
    updateWidth();
    const layoutListener = codeEditor.onDidLayoutChange(updateWidth);
    const zone: editor.IViewZone = {
        afterLineNumber: location.line - 1,
        heightInPx: getDocumentationHeight(),
        domNode: document.createElement("div"),
        suppressMouseDown: true,
        onDomNodeTop: top => {
            domNode.style.top = `${top}px`;
        },
    };
    // View zones reserve space but are hidden from accessibility APIs. Use an
    // overlay widget for the interactive editor, as Monaco does for peek views.
    const widget: editor.IOverlayWidget = {
        getId: () => "mcsrc.javadoc.inline",
        getDomNode: () => domNode,
        getPosition: () => null,
    };
    codeEditor.addOverlayWidget(widget);
    let zoneId = "";
    codeEditor.changeViewZones(accessor => {
        zoneId = accessor.addZone(zone);
    });
    const animation = createInlineAnimation(zone.heightInPx ?? 0, ({ height, opacity }) => {
        zone.heightInPx = height;
        domNode.style.height = `${height}px`;
        domNode.style.opacity = `${opacity}`;
        codeEditor.changeViewZones(accessor => accessor.layoutZone(zoneId));
    });
    let phase: "opening" | "open" | "closing" = "opening";
    codeEditor.revealLineInCenter(location.line);

    return {
        token,
        domNode,
        resize(height) {
            if (phase === "closing") return;

            if (phase === "opening") {
                animation.animateTo({ height, opacity: 1 }, () => {
                    phase = "open";
                });
            } else {
                animation.setHeight(height);
            }
        },
        close() {
            if (phase === "closing") return;

            phase = "closing";
            onClosing();
            codeEditor.focus();
            animation.animateTo({ height: getDocumentationHeight(), opacity: 0 }, () => {
                if (activeJavadocToken.value === token) {
                    activeJavadocToken.next(null);
                }
            });
        },
        dispose() {
            animation.dispose();
            layoutListener.dispose();
            codeEditor.removeOverlayWidget(widget);
            codeEditor.changeViewZones(accessor => accessor.removeZone(zoneId));
            if (activeJavadocToken.value === token) {
                activeJavadocToken.next(null);
            }
        },
    };
}

const JavadocInlineEditor = ({ codeEditor, result }: {
    codeEditor: editor.IStandaloneCodeEditor;
    result: DecompileResult;
}) => {
    const token = useObservable(activeJavadocToken);
    const [host, setHost] = useState<InlineHost | null>(null);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (!token || !result.tokens.includes(token) || codeEditor.getModel()?.getValue() !== result.source) {
            setHost(null);
            return;
        }

        setClosing(false);
        const inlineHost = createInlineHost(codeEditor, result, token, () => setClosing(true));
        setHost(inlineHost);
        return () => inlineHost.dispose();
    }, [codeEditor, result, token]);

    if (!host || host.token !== token) return null;

    return createPortal(
        <InlineForm token={host.token} onResize={host.resize} onClose={host.close} closing={closing} />,
        host.domNode,
    );
};

const InlineForm = ({ token, onResize, onClose, closing }: {
    token: Token;
    onResize: (height: number) => void;
    onClose: () => void;
    closing: boolean;
}) => {
    const [draft] = useState(() => getJavadocDraft(token, reportSaveError));
    const status = useObservable(draft.status);
    const containerRef = useRef<HTMLElement | null>(null);
    const { token: colors } = theme.useToken();

    useEffect(() => {
        return () => {
            void draft.flush();
        };
    }, [draft]);

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateHeight = () => onResize(container.getBoundingClientRect().height);
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(container);
        return () => observer.disconnect();
    }, [onResize]);

    const handleClose = () => {
        void draft.flush();
        onClose();
    };

    return (
        <section
            ref={containerRef}
            aria-label="Inline Javadoc editor"
            className="javadoc-inline-editor"
            style={{ background: colors.colorBgContainer, borderColor: colors.colorPrimary }}
            onMouseDown={event => event.stopPropagation()}
            onKeyDown={event => event.stopPropagation()}
        >
            <Flex align="center" justify="space-between" gap={8} className="javadoc-inline-toolbar">
                <Typography.Text strong>Javadoc</Typography.Text>
                <Typography.Text type="secondary" ellipsis>
                    {token.type === "field" || token.type === "method" ? token.name : token.className}
                </Typography.Text>
            </Flex>
            <JavadocMarkdownEditor
                value={draft.value}
                onChange={next => draft.update(next ?? "")}
                readOnly={closing}
            />
            <Flex justify="flex-end" gap={8} className="javadoc-inline-toolbar">
                <Typography.Text type={status === "error" ? "danger" : "secondary"} role="status">
                    {status === "saved" && "Saved"}
                    {status === "unsaved" && "Unsaved changes"}
                    {status === "saving" && "Saving…"}
                    {status === "error" && "Save failed"}
                </Typography.Text>
                {status === "error" && <Button size="small" onClick={() => void draft.flush()}>Retry</Button>}
                <Button size="small" onClick={handleClose} disabled={closing}>Close</Button>
            </Flex>
        </section>
    );
};

function reportSaveError(error: unknown) {
    message.error("Failed to save javadoc. Your draft has been kept; reopen the editor to retry.");
    console.error("Error saving javadoc:", error);
}

export default JavadocInlineEditor;
