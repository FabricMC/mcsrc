import { Table, Tag, Input, Button, Flex, theme, Checkbox, Tooltip } from 'antd';
import DiffVersionSelection from './DiffVersionSelection';
import {
    getDiffChanges,
    type ChangeState,
    type ChangeInfo,
    hideUnchangedSizes,
    getDiffSummary,
    type DiffSummary,
    diffView
} from '../../logic/Diff';
import { BehaviorSubject, map, combineLatest } from 'rxjs';
import { useObservable } from '../../utils/UseObservable';
import type { SearchProps } from 'antd/es/input';
import { selectedFile, setSelectedFile } from '../../logic/State';
import { isDecompiling } from "../../logic/Decompiler.ts";
import { useEffect, useMemo } from 'react';
import { bytecode } from "../../logic/Settings.ts";

const statusColors: Record<ChangeState, string> = {
    modified: 'gold',
    added: 'green',
    deleted: 'red',
};

const searchQuery = new BehaviorSubject("");

interface DiffEntry {
    key: string;
    file: string;
    statusInfo: ChangeInfo;
}

const entries = combineLatest([getDiffChanges(), searchQuery]).pipe(
    map(([changesMap, query]) => {
        const entriesArray: DiffEntry[] = [];
        const lowerQuery = query.toLowerCase();
        changesMap.forEach((info, file) => {
            if (!query || file.toLowerCase().includes(lowerQuery)) {
                entriesArray.push({
                    key: file,
                    file,
                    statusInfo: info,
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
    const summary = useObservable<DiffSummary>(useMemo(() => getDiffSummary(), []));
    const { token } = theme.useToken();

    const columns = useMemo(() => [
        {
            title: 'File',
            dataIndex: 'file',
            key: 'file',
            render: (file: string) => <span style={{ color: token.colorText }}>{file.replace('.class', '')}</span>,
        },
        {
            title: 'Status',
            dataIndex: 'statusInfo',
            key: 'status',
            render: (info: ChangeInfo) => (
                <Flex gap={6} align="center">
                    <Tag color={statusColors[info.state] || 'default'} style={{ marginRight: 0 }}>
                        {info.state.toUpperCase()}
                    </Tag>
                    {info.deletions !== undefined && info.deletions > 0 && (
                        <span style={{ color: token.colorError, fontSize: '12px', fontWeight: 'bold' }}>-{info.deletions}</span>
                    )}
                    {info.additions !== undefined && info.additions > 0 && (
                        <span style={{ color: token.colorSuccess, fontSize: '12px', fontWeight: 'bold' }}>+{info.additions}</span>
                    )}
                    {info.state === 'modified' && info.additions === 0 && info.deletions === 0 && (
                        <span style={{ color: token.colorTextDescription, fontSize: '12px', fontStyle: 'italic' }}>None</span>
                    )}
                </Flex>
            ),
        },
    ], [token]);

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
                {summary && (
                    <span style={{ marginLeft: 16, color: token.colorTextDescription }}>
                        {summary.added === 0 && summary.deleted === 0 && summary.modified === 0 ? "None" : (
                            <>
                                <span style={{ color: token.colorSuccess }}>+{summary.added} new files</span>
                                <span style={{ marginLeft: 8, color: token.colorError }}>-{summary.deleted} deleted</span>
                                <span style={{ marginLeft: 8 }}>{summary.modified} modified</span>
                            </>
                        )}
                    </span>
                )}
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
                    locale={{ emptyText: <span style={{ color: token.colorTextDescription }}>None</span> }}
                    rowClassName={(record) =>
                        currentFile === record.file ? 'ant-table-row-selected' : ''
                    }
                    onRow={(record) => ({
                        onClick: () => {
                            if (loading) return;
                            if (currentFile === record.file) return;

                            setSelectedFile(record.file);
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
