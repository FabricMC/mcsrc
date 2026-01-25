import { Tree } from 'antd';
import type { TreeDataNode, TreeProps } from 'antd';
import { CaretDownFilled } from '@ant-design/icons';
import { map, type Observable } from 'rxjs';
import { classesList } from '../logic/JarFile';
import { useObservable } from '../utils/UseObservable';
import { selectedFile } from '../logic/State';
import { useState } from 'react';
import type { Key } from 'antd/es/table/interface';
import { openTab } from '../logic/Tabs';
import { showLines } from '../logic/Settings';

// Sorts nodes with children first (directories before files), then alphabetically
const sortTreeNodes = (nodes: TreeDataNode[] = []) => {
    nodes.sort((a, b) => {
        const aHas = !!(a.children && a.children.length);
        const bHas = !!(b.children && b.children.length);
        if (aHas !== bHas) return aHas ? -1 : 1;
        const aTitle = String(a.title).toLowerCase();
        const bTitle = String(b.title).toLowerCase();
        return aTitle.localeCompare(bTitle);
    });
    nodes.forEach(n => {
        if (n.children && n.children.length) sortTreeNodes(n.children);
    });
};

// Given a list of class files, create a tree structure
const data: Observable<TreeDataNode[]> = classesList.pipe(
    map(classFiles => {
        console.log('Building file tree');
        const root: TreeDataNode[] = [];

        classFiles.forEach(filePath => {
            const parts = filePath.split('/');
            let currentLevel = root;

            parts.forEach((part, index) => {
                let existingNode = currentLevel.find(node => node.title === part);
                if (!existingNode) {
                    existingNode = {
                        title: part.replace('.class', ''),
                        key: parts.slice(0, index + 1).join('/'),
                        children: [],
                        isLeaf: index === parts.length - 1,
                    };
                    currentLevel.push(existingNode);
                }
                if (index < parts.length - 1) {
                    if (!existingNode.children) {
                        existingNode.children = [];
                    }
                    currentLevel = existingNode.children;
                }
            });
        });
        sortTreeNodes(root);
        return root;
    })
);

const selectedFileKeys = selectedFile.pipe(
    map(file => [file])
);

function getPathKeys(filePath: string): Key[] {
    const parts = filePath.split('/').slice(0, -1);
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        result.push(parts.slice(0, i + 1).join('/'));
    }
    return result;
}

const FileList = () => {
    const [expandedKeys, setExpandedKeys] = useState<Key[]>();

    const showLine = useObservable(showLines.observable);
    const selectedKeys = useObservable(selectedFileKeys);
    const classes = useObservable(classesList);

    const onSelect: TreeProps['onSelect'] = (selectedKeys) => {
        if (selectedKeys.length === 0) return;
        if (!classes || !classes.includes(selectedKeys[0] as string)) return;
        openTab(selectedKeys.join("/"));
    };

    const treeData = useObservable(data);

    if (!expandedKeys && selectedKeys) {
        setExpandedKeys(getPathKeys(selectedKeys[0]));
    }


    return (
        <Tree.DirectoryTree
            showLine={showLine}
            switcherIcon={<CaretDownFilled />}
            selectedKeys={selectedKeys}
            onSelect={onSelect}
            treeData={treeData}
            expandedKeys={[...expandedKeys || []]}
            onExpand={setExpandedKeys}
            titleRender={(nodeData) => (
                <span style={{ userSelect: "none" }}>{nodeData.title?.toString()}</span>
            )}
        />
    );
};

export default FileList;
