import { ReactFlow, type Node, type Edge, Background, useReactFlow, ReactFlowProvider, applyNodeChanges } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ClassNode } from "../../logic/Inheritance";
import { isInterface, isAbstract } from "../../utils/Classfile";
import { useLayoutEffect } from "react";
import dagre from "dagre";
import { InheritanceViewTab, openCodeTab } from "../../logic/tabs";

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

        const isSelected = node.name === classNode.name;
        const nodeIsInterface = node.classData ? isInterface(node.classData.accessFlags) : false;
        const nodeIsAbstract = node.classData ? isAbstract(node.classData.accessFlags) : false;
        let background = "#fff";
        let color = "#000";
        let borderStyle = "1px solid #1890ff";

        if (isSelected) {
            background = "#1890ff";
            color = "#fff";
        } else if (nodeIsInterface) {
            background = "#e6f7ff";
            borderStyle = "2px dashed #1890ff";
        } else if (nodeIsAbstract) {
            background = "#fff7e6";
            borderStyle = "1px dashed #fa8c16";
        }

        nodes.push({
            id: node.name,
            data: { label: getSimpleClassName(node.name) },
            position: { x: 0, y: 0 }, // Will be calculated by dagre
            style: {
                background,
                color,
                border: borderStyle,
                borderRadius: "5px",
                padding: "10px",
                cursor: "pointer",
                fontStyle: nodeIsInterface || nodeIsAbstract ? "italic" : "normal",
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

        const isSelected = node.name === classNode.name;
        const nodeIsInterface = node.classData ? isInterface(node.classData.accessFlags) : false;
        const nodeIsAbstract = node.classData ? isAbstract(node.classData.accessFlags) : false;
        let background = "#fff";
        let color = "#000";
        let borderStyle = "1px solid #1890ff";

        if (isSelected) {
            background = "#1890ff";
            color = "#fff";
        } else if (nodeIsInterface) {
            background = "#e6f7ff";
            borderStyle = "2px dashed #1890ff";
        } else if (nodeIsAbstract) {
            background = "#fff7e6";
            borderStyle = "1px dashed #fa8c16";
        }

        nodes.push({
            id: node.name,
            data: { label: getSimpleClassName(node.name) },
            position: { x: 0, y: 0 }, // Will be calculated by dagre
            style: {
                background,
                color,
                border: borderStyle,
                borderRadius: "5px",
                padding: "10px",
                cursor: "pointer",
                fontStyle: nodeIsInterface || nodeIsAbstract ? "italic" : "normal",
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

const InheritanceGraphInner = ({ tab, data }: { tab: InheritanceViewTab; data: ClassNode; }) => {
    const { getViewport, setViewport, fitView } = useReactFlow();

    // init once
    if (!tab.innerTabs.graph.initialized && data) {
        const { nodes, edges } = buildGraphData(data);

        tab.innerTabs.graph.nodes = nodes;
        tab.innerTabs.graph.edges = edges;
        tab.innerTabs.graph.initialized = true;
    }

    const nodes = tab.innerTabs.graph.nodes;
    const edges = tab.innerTabs.graph.edges;

    const onMoveEnd = (e: MouseEvent | TouchEvent | null) => {
        // If the move is not user-initiated, e is null
        if (e == null) return;
        tab.innerTabs.graph.viewport = getViewport();
    };

    useLayoutEffect(() => {
        const viewport = tab.innerTabs.graph.viewport;

        if (viewport) {
            setViewport(viewport, { duration: 0 });
        } else {
            fitView({ duration: 0 });
        }
    }, [tab, setViewport, fitView]);

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, { id }) => openCodeTab(`${id}.class`)}
            onMoveEnd={onMoveEnd}
            defaultViewport={tab.innerTabs.graph.viewport}
            proOptions={{ hideAttribution: true }}
        >
            <Background />
        </ReactFlow>
    );
};

const InheritanceGraph = ({ tab, data }: { tab: InheritanceViewTab, data: ClassNode; }) => {
    return (
        <div
            style={{
                height: "calc(100svh - 6rem)"
            }}
        >
            <ReactFlowProvider>
                <InheritanceGraphInner tab={tab} data={data} />
            </ReactFlowProvider>
        </div>
    );
};

export default InheritanceGraph;