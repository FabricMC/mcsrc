import { Table, Tag, Input, Button, Flex, theme, Checkbox, Tooltip } from 'antd';
import DiffVersionSelection from './DiffVersionSelection';
import { getDiffChanges, type ChangeState, hideUnchangedSizes } from '../../logic/Diff';
import { BehaviorSubject, map, combineLatest } from 'rxjs';
import { useObservable } from '../../utils/UseObservable';
import type { SearchProps } from 'antd/es/input';
import { selectedFile, setSelectedFile } from '../../logic/State';
import { diffView } from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler.ts";
import { useEffect } from 'react';
import { bytecode } from "../../logic/Settings.ts";

const statusColors: Record<ChangeState, string> = {
    modified: 'gold',
    added: 'green',
    deleted: 'red',
};

const columns = [
    {
        title: 'File',
        dataIndex: 'file',
        key: 'file',
    },
    {
        title: 'Status',
        dataIndex: 'status',
        key: 'status',
        render: (status: ChangeState) => (
            <Tag color={statusColors[status] || 'default'}>{status.toUpperCase()}</Tag>
        ),
    },
];

const searchQuery = new BehaviorSubject("");

const entries = combineLatest([getDiffChanges(), searchQuery]).pipe(
    map(([changesMap, query]) => {
        const entriesArray: { key: string; file: string; status: string; }[] = [];
        const lowerQuery = query.toLowerCase();
        changesMap.forEach((status, file) => {
            if (!query || file.toLowerCase().includes(lowerQuery)) {
                entriesArray.push({
                    key: file,
                    file,
                    status,
                });
            }
        });
        return entriesArray;
    })
);

const DiffFileList = () => {
    const dataSource = useObservable(entries) || [];
    const currentFile = useObservable(selectedFile);
    const loading = useObservable(isDecompiling);
    const hideUnchanged = useObservable(hideUnchangedSizes) || false;
    const { token } = theme.useToken();

    const onChange: SearchProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    const handleExitDiff = () => {
        diffView.next(false);
    };

    const handleHideUnchangedToggle = (checked: boolean) => {
        hideUnchangedSizes.next(checked);
    };

    useEffect(() => {
        if (dataSource.length > 500 && !hideUnchanged) {
            hideUnchangedSizes.next(true);
        }
    }, [dataSource.length, hideUnchanged]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginLeft: 8, marginRight: 8, overflow: 'hidden' }}>
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    paddingBottom: 12,
                    paddingTop: 12,
                    backgroundColor: token.colorBgContainer
                }}
            >
                <Input.Search
                    placeholder="Search classes"
                    allowClear
                    onChange={onChange}
                    style={{ width: 220 }}
                />
                <Tooltip title="Hide modified classes that have the same uncompressed size. This is useful for versions where the compiler version has changed but the code hasn't.">
                    <Checkbox
                        checked={hideUnchanged}
                        onChange={(e) => handleHideUnchangedToggle(e.target.checked)}
                        style={{ marginLeft: 8 }}
                    >
                        Hide same size
                    </Checkbox>
                </Tooltip>
                <Flex
                    gap={8}
                    align="center"
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: 12,
                        transform: 'translateX(-50%)',
                    }}
                >
                    <DiffVersionSelection />
                </Flex>
                <div
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 0
                    }}
                >
                    <Checkbox
                        checked={useObservable(bytecode.observable)}
                        onChange={e => bytecode.value = e.target.checked}
                    >
                        Show Bytecode
                    </Checkbox>
                    <Button
                        type="default"
                        variant={"outlined"}
                        onClick={handleExitDiff}
                    >
                        Exit Diff
                    </Button>
                </div>
            </div>
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto'
                }}
            >
                <Table
                    dataSource={dataSource}
                    columns={columns}
                    pagination={false}
                    size="small"
                    bordered
                    showHeader={false}
                    rowClassName={(record) =>
                        currentFile === record.file + ".class" ? 'ant-table-row-selected' : ''
                    }
                    onRow={(record) => ({
                        onClick: () => {
                            if (loading) return;
                            if (currentFile === record.file + ".class") return;

                            setSelectedFile(record.file + ".class");
                        }
                    })}
                    style={{
                        cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                />
            </div>
        </div>
    );
};

export default DiffFileList;