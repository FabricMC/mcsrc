import {
  ReactFlow,
  type Node,
  type Edge,
  Background,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ClassNode, selectedInheritanceClassName } from "../../logic/Inheritance";
import { isInterface, isAbstract } from "../../utils/Classfile";
import { useMemo, useCallback, useEffect } from "react";
import dagre from "dagre";
import { openTab } from "../../logic/Tabs";

function buildGraphData(classNode: ClassNode): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const visited = new Set<string>();

  const getSimpleClassName = (fullName: string) => {
    const i = fullName.lastIndexOf("/");
    return i === -1 ? fullName : fullName.substring(i + 1);
  };

  function addNodeWithParents(node: ClassNode): void {
    if (visited.has(node.name)) return;
    visited.add(node.name);

    const isSelected = node.name === classNode.name;
    const nodeIsInterface = isInterface(node.accessFlags);
    const nodeIsAbstract = isAbstract(node.accessFlags);
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
    const nodeIsInterface = isInterface(node.accessFlags);
    const nodeIsAbstract = isAbstract(node.accessFlags);
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
    rankdir: "TB", // Top to Bottom
    nodesep: 100,
    ranksep: 100,
    edgesep: 50,
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

const InheritanceGraphInner = ({ data }: { data: ClassNode }) => {
  const { nodes, edges } = useMemo(() => {
    if (!data) return { nodes: [], edges: [] };
    return buildGraphData(data);
  }, [data]);

  const { setCenter, getNode } = useReactFlow();

  useEffect(() => {
    if (!data) return;

    const timer = setTimeout(() => {
      const selectedNode = getNode(data.name);
      if (selectedNode) {
        void setCenter(selectedNode.position.x + 100, selectedNode.position.y + 25, {
          zoom: 1,
          duration: 300,
        });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [data, setCenter, getNode]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Convert internal class name format (e.g., "net/minecraft/ChatFormatting") to file path
    const filePath = node.id + ".class";
    openTab(filePath);
    selectedInheritanceClassName.next(null);
  }, []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      proOptions={{ hideAttribution: true }}
      onNodeClick={onNodeClick}
    >
      <Background />
    </ReactFlow>
  );
};

const InheritanceGraph = ({ data }: { data: ClassNode }) => {
  return (
    <div style={{ width: "100%", height: "80vh" }}>
      <ReactFlowProvider>
        <InheritanceGraphInner data={data} />
      </ReactFlowProvider>
    </div>
  );
};

export default InheritanceGraph;
