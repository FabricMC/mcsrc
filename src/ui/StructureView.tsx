import { Empty, Tree } from "antd";
import type { TreeDataNode, TreeProps } from "antd";
import { useMemo } from "react";
import { useObservable } from "../utils/UseObservable";
import { currentResult } from "../logic/Decompiler";
import { parseDescriptor } from "./CodeHoverProvider";
import { getTokenLocation, type MemberToken, type Token } from "../logic/Tokens";
import { setSelectedFile } from "../logic/State";

type StructureNode = TreeDataNode & { token?: Token };

const formatClassDisplayName = (className: string) => {
    const simpleName = className.split("/").pop();
    return simpleName || className;
};

const formatMethodDisplayName = (token: MemberToken, classDisplayName: string) => {
    const methodName = token.name === "<init>" ? classDisplayName : token.name;
    const signature = parseDescriptor(token.descriptor);
    return `${methodName}${signature}`;
};

type StructureViewProps = {
    onNavigate?: () => void;
};

const StructureView = ({ onNavigate }: StructureViewProps) => {
    const decompileResult = useObservable(currentResult);

    const { treeData, tokenByKey } = useMemo(() => {
        const tokenMap = new Map<string, Token>();

        if (!decompileResult || decompileResult.language !== "java") {
            return { treeData: [] as StructureNode[], tokenByKey: tokenMap };
        }

        const classTokens = new Map<string, Token>();
        const methodsByClass = new Map<string, MemberToken[]>();

        for (const token of decompileResult.tokens) {
            if (token.type === "class" && token.declaration) {
                classTokens.set(token.className, token);
            }

            if (token.type === "method" && token.declaration) {
                const bucket = methodsByClass.get(token.className) || [];
                bucket.push(token);
                methodsByClass.set(token.className, bucket);
            }
        }

        const classes = Array.from(methodsByClass.keys()).sort();
        const nodes: StructureNode[] = classes.map((className) => {
            const classDisplayName = formatClassDisplayName(className);
            const classKey = `class:${className}`;
            const classNode: StructureNode = {
                key: classKey,
                title: <span className="structure-title" title={className}>{classDisplayName}</span>,
                children: []
            };

            const classToken = classTokens.get(className);
            if (classToken) {
                classNode.token = classToken;
                tokenMap.set(classKey, classToken);
            }

            const methods = methodsByClass.get(className) || [];
            methods.sort((a, b) => a.start - b.start);

            classNode.children = methods.map((method) => {
                const methodKey = `method:${className}:${method.start}`;
                tokenMap.set(methodKey, method);
                return {
                    key: methodKey,
                    title: <span className="structure-title" title={`${method.name}${method.descriptor}`}>{formatMethodDisplayName(method, classDisplayName)}</span>,
                    isLeaf: true,
                    token: method
                } satisfies StructureNode;
            });

            return classNode;
        });

        return { treeData: nodes, tokenByKey: tokenMap };
    }, [decompileResult]);

    const onSelect: TreeProps["onSelect"] = (_, info) => {
        if (!decompileResult) return;
        const node = info.node as StructureNode;
        const token = node.token || (node.key ? tokenByKey.get(String(node.key)) : undefined);
        if (!token) return;

        const location = getTokenLocation(decompileResult, token);
        setSelectedFile(decompileResult.className, location.line);
        onNavigate?.();
    };

    if (!decompileResult || decompileResult.language !== "java") {
        return <Empty description="Structure view unavailable" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    if (treeData.length === 0) {
        return <Empty description="No methods found" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
    }

    return (
        <Tree
            className="structure-tree"
            treeData={treeData}
            showLine
            defaultExpandAll
            blockNode
            onSelect={onSelect}
        />
    );
};

export default StructureView;