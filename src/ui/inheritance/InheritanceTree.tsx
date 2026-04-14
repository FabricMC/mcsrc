import { Tree, type TreeDataNode } from "antd";
import { ApiOutlined, CopyrightOutlined, NumberOutlined } from "@ant-design/icons";
import { useCallback, type Key } from "react";
import { ClassNode } from "../../logic/Inheritance";
import { isEnum, isInterface } from "../../utils/Classfile";
import { InheritanceViewTab, openCodeTab } from "../../logic/tabs";
import { ClassDataIcon } from "../intellij-icons";

function getSimpleClassName(fullName: string): string {
    const i = fullName.lastIndexOf('/');
    return i === -1 ? fullName : fullName.substring(i + 1);
}

function renderIcon(node: ClassNode) {
    if (node.classData == null) return;
    return <ClassDataIcon data={node.classData} style={{ fontSize: '16px' }} />;
}

function renderTitle(node: ClassNode) {
    const fullName = node.name.replaceAll('/', '.');

    return (
        <span>
            <span>{getSimpleClassName(node.name)}</span>
            <span style={{ fontSize: 12, color: "#595959", marginLeft: 8 }}>{fullName}</span>
        </span>
    );
}

function buildTreeData(root: ClassNode, selectedName: string): { nodes: TreeDataNode[]; expanded: string[]; } {
    const visited = new Set<string>();

    interface WalkResult {
        dataNode: TreeDataNode;
        expanded: string[];
    }

    function walk(node: ClassNode): WalkResult | null {
        // This shouldn't happen, but just in case to prevent infinite loops.
        if (visited.has(node.name)) return null;
        visited.add(node.name);

        const childResults = node.children
            .map(child => walk(child))
            .filter(child => child !== null);

        childResults.sort((a, b) => {
            if (a.expanded.length !== b.expanded.length) return b.expanded.length - a.expanded.length;
            const aName = getSimpleClassName(a.dataNode.key as string);
            const bName = getSimpleClassName(b.dataNode.key as string);
            return aName.localeCompare(bName);
        });

        // Expand all nodes that either have expanded children, or are the selected node.
        const hasSelected = node.name === selectedName || childResults.some(child => child.expanded.length > 0);
        const expanded = childResults.flatMap(child => child.expanded);

        if (hasSelected && childResults.length > 0) {
            expanded.push(node.name);
        }

        const dataNode: TreeDataNode = {
            key: node.name,
            title: renderTitle(node),
            icon: renderIcon(node),
            children: childResults.map(child => child.dataNode)
        };

        return { dataNode, expanded };
    }

    const result = walk(root);
    if (!result) return { nodes: [], expanded: [] };

    return {
        nodes: [result.dataNode],
        expanded: Array.from(new Set(result.expanded))
    };
}

const InheritanceTree = ({ tab, data }: { tab: InheritanceViewTab, data: ClassNode; }) => {
    if (!tab.innerTabs.tree.initialized && data) {
        const { nodes, expanded } = buildTreeData(data.getRoot(), data.name);

        tab.innerTabs.tree.nodes = nodes;
        tab.innerTabs.tree.expanded = expanded;
        tab.innerTabs.tree.initialized = true;
    }

    const nodes = tab.innerTabs.tree.nodes;

    const expanded = tab.innerTabs.tree.expanded;

    const onSelect = useCallback((selectedKeys: Key[]) => {
        const selected = selectedKeys[0];
        if (!selected) return;

        // Convert internal class name format (e.g., "net/minecraft/ChatFormatting") to file path
        openCodeTab(`${selected}.class`);
    }, []);

    return (
        <Tree
            styles={{
                root: { background: "transparent" },
                itemIcon: {
                    position: "relative",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center"
                }
            }}
            key={data?.name ?? "inheritance-tree"}
            treeData={nodes}
            selectedKeys={data ? [data.name] : []}
            defaultExpandedKeys={expanded}
            onExpand={(expanded) => tab.innerTabs.tree.expanded = expanded}
            showLine
            showIcon
            onSelect={onSelect}
        />
    );
};

export default InheritanceTree;