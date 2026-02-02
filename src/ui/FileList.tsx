import { Tree, Dropdown, message } from 'antd';
import type { TreeDataNode, TreeProps, MenuProps } from 'antd';
import { CaretDownFilled } from '@ant-design/icons';
import { firstValueFrom, map, shareReplay, type Observable } from 'rxjs';
import { classesList } from '../logic/JarFile';
import { useObservable } from '../utils/UseObservable';
import { selectedFile } from '../logic/State';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Key } from 'antd/es/table/interface';
import { openTab } from '../logic/Tabs';
import { minecraftJar, type MinecraftJar } from '../logic/MinecraftApi';
import { decompileClass, DECOMPILER_OPTIONS } from '../logic/Decompiler';
import { usageQuery } from '../logic/FindUsages';

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
const fileTree: Observable<TreeDataNode[]> = classesList.pipe(
    map(classFiles => {
        const root: TreeDataNode[] = [];

        classFiles.forEach(filePath => {
            const parts = filePath.split('/');
            let currentLevel = root;

            parts.forEach((part, index) => {
                let existingNode = currentLevel.find(node => node.title === part);
                if (!existingNode) {
                    const isLeaf = index === parts.length - 1;
                    existingNode = {
                        title: part.replace('.class', ''),
                        key: parts.slice(0, index + 1).join('/'),
                        children: isLeaf ? undefined : [],
                        isLeaf: isLeaf
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
    }),
    shareReplay(1)
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

const handleCopyContent = async (path: string, jar: MinecraftJar) => {
    try {
        message.loading({ content: 'Decompiling...', key: 'copy-content' });
        const result = await decompileClass(path, jar.jar, DECOMPILER_OPTIONS);
        await navigator.clipboard.writeText(result.source);
        message.success({ content: 'Content copied to clipboard', key: 'copy-content' });
    } catch (e) {
        console.error(e);
        message.error({ content: 'Failed to copy content', key: 'copy-content' });
    }
};

interface ContextMenuInfo {
    x: number;
    y: number;
    key: string;
    isLeaf: boolean;
}

const getMenuItems = (
    contextMenu: ContextMenuInfo | null,
    handleCopyItem: (path: string) => void,
    jar: MinecraftJar | undefined
): MenuProps['items'] => {
    if (!contextMenu) return [];

    const path = contextMenu.key;
    const isFile = path.endsWith('.class');
    const packagePath = path.replace(/\//g, '.').replace('.class', '');
    const filename = path.split('/').pop() || '';
    const linkPath = path.replace('.class', '');
    const link = jar ? `https://mcsrc.dev/#1/${jar.version}/${linkPath}` : '';

    const renderLabel = (title: string, value: string) => (
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'space-between', alignItems: 'center', minWidth: '300px' }}>
            <span style={{ whiteSpace: 'nowrap' }}>{title}</span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
                <span style={{
                    color: 'rgba(255, 255, 255, 0.45)',
                    fontSize: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '250px'
                }} title={value}>
                    {value}
                </span>
            </div>
        </div>
    );

    return [
        {
            key: 'copy-package-path',
            label: renderLabel('Copy Package Path', packagePath),
            onClick: () => {
                navigator.clipboard.writeText(packagePath);
                message.success('Package Path copied');
            }
        },
        {
            key: 'copy-path',
            label: renderLabel('Copy Path', path),
            onClick: () => {
                navigator.clipboard.writeText(path);
                message.success('Path copied');
            }
        },
        {
            key: 'copy-filename',
            label: renderLabel('Copy Filename', filename),
            onClick: () => {
                navigator.clipboard.writeText(filename);
                message.success('Filename copied');
            }
        },
        {
            key: 'copy-link',
            label: renderLabel('Copy Link', link),
            onClick: () => {
                if (link) {
                    navigator.clipboard.writeText(link);
                    message.success('Link copied');
                }
            },
            disabled: !link || !isFile
        },
        {
            key: 'copy-content',
            label: 'Copy File Content',
            onClick: () => handleCopyItem(contextMenu.key),
            disabled: !isFile
        },
        {
            key: 'find-usages',
            label: 'Find Usages',
            onClick: () => {
                const cleanPath = path.replace('.class', '');
                usageQuery.next(cleanPath);
            },
            disabled: !isFile
        },
    ];
};

const FileList = () => {
    const [expandedKeys, setExpandedKeys] = useState<Key[]>();
    const [contextMenu, setContextMenu] = useState<ContextMenuInfo | null>(null);

    const jar = useObservable(minecraftJar);
    const selectedKeys = useObservable(selectedFileKeys);
    const classes = useObservable(classesList);
    const onSelect: TreeProps['onSelect'] = useCallback((selectedKeys: Key[]) => {
        if (selectedKeys.length === 0) return;
        if (!classes || !classes.includes(selectedKeys[0] as string)) return;
        openTab(selectedKeys.join("/"));
    }, [classes]);

    const treeData = useObservable(fileTree);

    useEffect(() => {
        if (expandedKeys === undefined && selectedKeys?.[0]) {
            setExpandedKeys(getPathKeys(selectedKeys[0] as string));
        }
    }, [expandedKeys, selectedKeys]);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        document.addEventListener('click', closeMenu);
        return () => document.removeEventListener('click', closeMenu);
    }, []);

    const onRightClick: TreeProps['onRightClick'] = useCallback(({ event, node }: any) => {
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            key: node.key as string,
            isLeaf: !!node.isLeaf
        });
    }, []);

    const menuItems = useMemo(() => getMenuItems(contextMenu, (path) => {
        if (jar) {
            handleCopyContent(path, jar);
        }
    }, jar), [contextMenu, jar]);

    return (
        <>
            <Tree.DirectoryTree
                showLine
                switcherIcon={<CaretDownFilled />}
                selectedKeys={selectedKeys}
                onSelect={onSelect}
                treeData={treeData}
                expandedKeys={expandedKeys ?? []}
                onExpand={setExpandedKeys}
                onRightClick={onRightClick}
                titleRender={(nodeData) => (
                    <span style={{ userSelect: "none" }}>{nodeData.title?.toString()}</span>
                )}
            />
            {contextMenu && (
                <div key={contextMenu.key + contextMenu.x + contextMenu.y} style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 1000 }}>
                    <Dropdown
                        menu={{ items: menuItems }}
                        open={true}
                        trigger={['click']}
                    >
                        <span />
                    </Dropdown>
                </div>
            )}
        </>
    );
};

export default FileList;
