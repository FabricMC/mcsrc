import type { TreeDataNode } from "antd";
import { Tab } from "./Tabs";
import type { Key } from "react";
import { selectedFile } from "../State";

export class InheritanceViewTab extends Tab {
    public innerTabs: {
        active: string,
        tree: {
            initialized: boolean,
            nodes: TreeDataNode[],
            expanded: Key[];
        },
        graph: {
            initialized: boolean,
            nodes: any[],
            edges: any[],
            viewport: undefined | { x: number, y: number, zoom: number; },
        };
    } = {
            active: "tree",
            tree: {
                initialized: false,
                nodes: [],
                expanded: []
            },
            graph: {
                initialized: false,
                nodes: [] as any[],
                edges: [] as any[],
                viewport: undefined
            }
        };

    constructor(key: string) {
        super(`hierarchy::${key}`);
    }

    public open(): void {
        super.open();

        selectedFile.next("");

        (async () => {
            // We need to unfortunately do an async import here because else we'll get
            // a circular import (minecraftJar)
            const { selectedInheritanceClassName } = await import("../Inheritance");
            selectedInheritanceClassName.next(this.key.replace("hierarchy::", ""));
        })();
    }

    protected onBlur(): void {
        super.onBlur();

        (async () => {
            const { selectedInheritanceClassName } = await import("../Inheritance");
            selectedInheritanceClassName.next(null);
        })();
    }
}