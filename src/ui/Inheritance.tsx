import { ReactFlow, type Node, type Edge, Background } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type ClassNode } from "../logic/Inheritance";
import { useMemo } from "react";
import dagre from "dagre";

function buildGraphData(classNode: ClassNode): { nodes: Node[]; edges: Edge[]; } {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const visited = new Set<string>();

    const getSimpleClassName = (fullName: string) => {
        const i = fullName.lastIndexOf('/');
        return i === -1 ? fullName : fullName.substring(i + 1);
    };

    function addNodeWithParents(node: ClassNode): void {
        if (visited.has(node.name)) return;
        visited.add(node.name);

        nodes.push({
            id: node.name,
            data: { label: getSimpleClassName(node.name) },
            position: { x: 0, y: 0 }, // Will be calculated by dagre
            style: {
                background: node.name === classNode.name ? "#1890ff" : "#fff",
                color: node.name === classNode.name ? "#fff" : "#000",
                border: "1px solid #1890ff",
                borderRadius: "5px",
                padding: "10px",
            },
        });

        // Add all parents
        node.parents.forEach((parent) => {
            edges.push({
                id: `${parent.name}-${node.name}`,
                source: parent.name,
                target: node.name,
                animated: false,
            });
            addNodeWithParents(parent);
        });
    }

    function addNodeWithChildren(node: ClassNode): void {
        if (visited.has(node.name)) return;
        visited.add(node.name);

        nodes.push({
            id: node.name,
            data: { label: getSimpleClassName(node.name) },
            position: { x: 0, y: 0 }, // Will be calculated by dagre
            style: {
                background: node.name === classNode.name ? "#1890ff" : "#fff",
                color: node.name === classNode.name ? "#fff" : "#000",
                border: "1px solid #1890ff",
                borderRadius: "5px",
                padding: "10px",
            },
        });

        // Add all children
        node.children.forEach((child) => {
            edges.push({
                id: `${node.name}-${child.name}`,
                source: node.name,
                target: child.name,
                animated: false,
            });
            addNodeWithChildren(child);
        });
    }

    // First add the selected node and its parents
    addNodeWithParents(classNode);

    // Then add the children of the selected node
    classNode.children.forEach((child) => {
        edges.push({
            id: `${classNode.name}-${child.name}`,
            source: classNode.name,
            target: child.name,
            animated: false,
        });
        addNodeWithChildren(child);
    });

    // Use dagre to calculate positions
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: 'TB', // Top to Bottom
        nodesep: 100,
        ranksep: 100,
        edgesep: 50
    });

    // Add nodes to dagre graph
    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 200, height: 50 });
    });

    // Add edges to dagre graph
    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    // Calculate layout
    dagre.layout(dagreGraph);

    // Apply calculated positions to nodes
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 100,
                y: nodeWithPosition.y - 25,
            },
        };
    });

    console.log(`Graph built: ${layoutedNodes.length} nodes, ${edges.length} edges`);
    return { nodes: layoutedNodes, edges };
}

const Inheritance = ({ data }: { data: ClassNode; }) => {
    const { nodes, edges } = useMemo(() => {
        if (!data) return { nodes: [], edges: [] };
        return buildGraphData(data);
    }, [data]);

    return (
        <div style={{ height: "80vh", width: "100%" }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                proOptions={{ hideAttribution: true }}
            >
                <Background />
            </ReactFlow>
        </div>
    );
};

export default Inheritance;