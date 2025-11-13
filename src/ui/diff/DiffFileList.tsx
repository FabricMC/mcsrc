import { Table, Tag, Input, Button, Flex, theme } from 'antd';
import DiffVersionSelection from './DiffVersionSelection';
import { getDiffChanges, type ChangeState } from '../../logic/Diff';
import { BehaviorSubject, map, combineLatest } from 'rxjs';
import { useObservable } from '../../utils/UseObservable';
import type { SearchProps } from 'antd/es/input';
import { selectedFile, setSelectedFile } from '../../logic/State';
import { diffView } from "../../logic/Diff";
import { isDecompiling } from "../../logic/Decompiler.ts";

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
    const { token } = theme.useToken();

    const onChange: SearchProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    const handleExitDiff = () => {
        diffView.next(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginLeft: 8, marginRight: 8 }}>
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
                <Button
                    type="default"
                    variant={"outlined"}
                    onClick={handleExitDiff}
                    style={{
                        position: 'absolute',
                        top: 12,
                        right: 0
                    }}
                >
                    Exit Diff
                </Button>
            </div>
            <div
                className={"webkit-scrollbar-hide"}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    scrollbarWidth: "none"
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