import { Table, Tag, Input, Select, Flex } from 'antd';
import DiffVersionSelection from './DiffVersionSelection';
import { getDiffChanges, type ChangeState } from '../../logic/Diff';
import { BehaviorSubject, map, combineLatest } from 'rxjs';
import { useObservable } from '../../utils/UseObservable';
import type { SearchProps } from 'antd/es/input';
import { selectedFile, setSelectedFile, state } from '../../logic/State';

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
        const entriesArray: { key: string; file: string; status: string }[] = [];
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

    const onChange: SearchProps['onChange'] = (e) => {
        searchQuery.next(e.target.value);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    marginBottom: 12,
                    paddingTop: 12,
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
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
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
                            setSelectedFile(record.file + ".class");
                        }
                    })}
                />
            </div>
        </div>
    );
};

export default DiffFileList;