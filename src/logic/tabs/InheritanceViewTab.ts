import type { TreeDataNode } from "antd";
import { Tab } from "./Tabs";
import type { Key } from "react";
import { selectedFile, tabHistory } from "../State";

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

    private async setSelectedInheritanceClassName(key: string | null) {
        // We need to unfortunately do an async import here because else we'll get
        // a circular import (minecraftJar)
        const { selectedInheritanceClassName } = await import("../Inheritance");
        selectedInheritanceClassName.next(key);
    }

    public open(): void {
        super.open();

        selectedFile.next("");
        this.setSelectedInheritanceClassName(this.key.replace("hierarchy::", ""));
    }

    protected onBlur(): void {
        super.onBlur();
        this.setSelectedInheritanceClassName(null);
    }

    public onClose(): void {
        super.onClose();
        this.setSelectedInheritanceClassName(null);
    }

    public openLastTabFromHistory(): void {
        super.openLastTabFromHistory();
        if (tabHistory.value.length > 0) return;
        this.setSelectedInheritanceClassName("");
    }
}