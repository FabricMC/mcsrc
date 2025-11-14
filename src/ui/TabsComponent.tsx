import { Tabs } from "antd";
import { useObservable } from "../utils/UseObservable";
import { activeTabKey, closeTab, openTab, openTabs, setTabPosition } from "../logic/Tabs";
import React, { useRef, useState } from "react";

export const TabsComponent = () => {
    // variables - tabs
    const activeKey = useObservable(activeTabKey);
    const tabs = useObservable(openTabs);
    const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // variables - dragging
    const draggingKey = useRef("");
    const [placeIndex, _setPlaceIndex] = useState(-1); // state to render border
    const placeIndexRef = useRef(-1); // additional ref because mouseup and mousemove happen in same tick and would not be in sync

    // variables - dragging (mouse positioning)
    const mouseMovementDelta = useRef(0); // tracks how far the mouse has moved
    const lastMousePos = useRef({ x: -1, y: -1 })
    const threshold = 50; // mouse movement threshold after which tab dragging will activate

    // variables - tab ghost image
    const ghostImage = useRef<HTMLElement | null>(null);

    // helpers
    const getRects = () => {
        return Object.entries(tabRefs.current).map(([k, el]) => {
            const rect = el?.getBoundingClientRect();
            return ({
                key: k,
                x: rect?.x ?? -1000,
                width: rect?.width ?? 0
            })
        })
    }

    const borderStyle = (key: string) => {
        if (!tabs) return;

        const style = {
            borderLeft: "2px solid transparent",
            borderRight: "2px solid transparent"
        }

        const tabIndex = tabs.indexOf(key);

        if (tabIndex === placeIndex && mouseMovementDelta.current >= threshold) {
            style.borderLeft = "2px solid white";
            return style;
        };

        if (tabIndex === tabs.length - 1 && placeIndex > tabIndex && mouseMovementDelta.current >= threshold) {
            style.borderRight = "2px solid white";
            return style;
        }

        return style;
    }

    const setGhostImage = (element: HTMLDivElement) => {
        if (!tabRefs || !tabRefs.current) return;

        // Not the best, but it works :>
        const ghost = document.createElement("div");
        ghost.textContent = element.textContent || "";
        ghost.style.position = "absolute";
        ghost.style.background = "black";
        ghost.style.color = "white";
        ghost.style.padding = ".5rem 1rem";
        ghost.style.whiteSpace = "nowrap";
        ghost.style.pointerEvents = "none";
        ghost.style.border = "1px solid #303030";
        ghost.style.borderRadius = "8px";
        ghost.style.visibility = "hidden"
        document.body.appendChild(ghost);
        ghostImage.current = ghost;
    }

    const setPlaceIndexSync = (v: number) => {
        placeIndexRef.current = v;
        _setPlaceIndex(v);
    };

    // listeners
    type TargetKey = React.MouseEvent | React.KeyboardEvent | string;
    const onEdit = (targetKey: TargetKey, action: "add" | "remove") => {
        if (action === "add") return;
        if (!(typeof targetKey === "string")) return;
        closeTab(targetKey);
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>, key: string) => {
        mouseMovementDelta.current = 0;
        lastMousePos.current = { x: e.clientX, y: e.clientY }

        draggingKey.current = key;

        setGhostImage(e.currentTarget);

        // Add listeners to global document
        document.addEventListener("mouseup", handleMouseUp);
        document.addEventListener("mousemove", handleMouseMove);
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (draggingKey.current === "") return;

        const rects = getRects();
        if (!rects[0]) return;


        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        mouseMovementDelta.current += Math.sqrt(dx * dx + dy * dy);

        lastMousePos.current = { x: e.clientX, y: e.clientY }

        if (mouseMovementDelta.current < threshold) return;

        if (ghostImage.current) {
            ghostImage.current.style.visibility = "visible";
            ghostImage.current.style.left = e.clientX + "px";
            ghostImage.current.style.top = e.clientY + "px";
        };


        const startX = rects[0].x;

        const { clientX } = e;
        const mouseX = clientX - startX;

        const closest = rects
            .map(r => {
                const mid = r.x + r.width / 2 - startX;
                return {
                    key: r.key,
                    dist: Math.abs(mid - mouseX),
                    before: mouseX < mid // before midpoint?
                }
            })
            .sort((a, b) => a.dist - b.dist)[0];

        const index = (tabs?.indexOf(closest.key) ?? -Infinity) + (closest.before ? 0 : 1);
        if (index < 0) return;

        setPlaceIndexSync(index);
    }

    const handleMouseUp = () => {
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("mouseover", handleMouseMove)

        const currentIndex = tabs ? tabs.indexOf(draggingKey.current) : -1;
        if (
            placeIndexRef.current >= 0 &&
            placeIndexRef.current !== currentIndex
        ) {
            setTabPosition(draggingKey.current, placeIndexRef.current);
            openTab(draggingKey.current);
        }

        draggingKey.current = "";
        setPlaceIndexSync(-1);

        if (ghostImage.current) document.body.removeChild(ghostImage.current);
    }

    return (
        <Tabs
            hideAdd
            type="editable-card"
            activeKey={activeKey}
            onEdit={onEdit}
            onTabClick={(key) => openTab(key)}
            items={tabs?.map((key) => ({
                key,
                label: (
                    <div
                        onMouseDown={(e) => { handleMouseDown(e, key) }}
                        ref={(el) => { tabRefs.current[key] = el }}
                        style={{ userSelect: "none", }}
                    >
                        {key.replace(".class", "").split("/").pop()}
                    </div>
                )
            }))}
            renderTabBar={(tabBarProps, DefaultTabBar) => (
                <DefaultTabBar {...tabBarProps}>
                    {(node) => (
                        <div style={borderStyle(String(node.key))}>
                            {node}
                        </div>
                    )}
                </DefaultTabBar>
            )}
        />
    );
};