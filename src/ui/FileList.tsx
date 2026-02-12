import { Tree, Dropdown, message, ConfigProvider } from 'antd';
import type { TreeDataNode, TreeProps, MenuProps } from 'antd';
import { CaretDownFilled } from '@ant-design/icons';
import { combineLatest, from, map, shareReplay, switchMap, type Observable } from 'rxjs';
import { classesList } from '../logic/JarFile';
import { useObservable } from '../utils/UseObservable';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Key } from 'antd/es/table/interface';
import { openTab } from '../logic/Tabs';
import { minecraftJar, type MinecraftJar } from '../logic/MinecraftApi';
import { decompileClass } from '../logic/Decompiler';
import { selectedFile, usageQuery } from '../logic/State';
import { compactPackages } from '../logic/Settings';
import { jarIndex } from '../workers/JarIndex';
import { ClassDataIcon, PackageIcon } from './intellij-icons';

const classes = jarIndex.pipe(switchMap(j => from(j.getClassData())));
const fileTree: Observable<TreeDataNode[]> = combineLatest([
    classes,
    compactPackages.observable
]).pipe(
    map(([classes, compact]) => {
        const dirs = new Map<string, TreeDataNode[]>();
        dirs.set('', []);

        for (const classData of classes) {
            const { className } = classData;
            if (className.includes('$')) continue;

            const i = className.lastIndexOf('/');
            const dirPath = className.slice(0, i);

            if (!dirs.has(dirPath)) {
                const parts = dirPath.split('/');
                parts.forEach((p, i) => {
                    const parent = parts.slice(0, i).join('/');
                    const current = parent === '' ? p : `${parent}/${p}`;

                    if (!dirs.has(current)) {
                        dirs.set(current, []);
                        dirs.get(parent)!.push({
                            title: p,
                            key: current,
                            icon: <PackageIcon style={{ fontSize: '16px' }} />,
                            children: [],
                            isLeaf: false,
                        });
                    };
                });
            };

            dirs.get(dirPath)!.push({
                title: className.slice(i + 1),
                key: `${className}.class`,
                icon: <ClassDataIcon data={classData} style={{ fontSize: '16px' }} />,
                isLeaf: true,
            });
        }

        function traverse(dir: string, prefix: string, parent: TreeDataNode) {
            const nodes = dirs.get(dir)!;

            if (compact && nodes.length === 1 && !nodes[0].isLeaf) {
                const node = nodes[0];
                parent.title = `${parent.title}/${node.title}`;
                traverse(node.key as string, prefix, parent);
            } else {
                for (const node of nodes) {
                    parent.children!.push(node);

                    if (!node.isLeaf) {
                        traverse(node.key as string, prefix, node);
                    };
                }
            }

            parent.children!.sort((a, b) => {
                if (a.isLeaf && !b.isLeaf) return +1;
                if (!a.isLeaf && b.isLeaf) return -1;
                return a.title! < b.title! ? -1 : +1;
            });
        }

        const root: TreeDataNode[] = [];
        traverse('', '', { title: '', key: '', children: root });

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
        const result = await decompileClass(path, jar.jar);
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
    const link = jar ? `https://mcsrc.dev/1/${jar.version}/${linkPath}` : '';

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
