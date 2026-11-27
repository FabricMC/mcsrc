import { Alert, Empty, Flex, Select, Spin, Table, Typography, type TableColumnsType } from "antd";
import { useObservable } from "../../utils/UseObservable";
import {
    launcherRuntimes, launcherRuntimeSort, launcherSelection, updateLauncherSelection,
} from "../../logic/LauncherMeta";
import type { JavaRuntime } from "../../logic/MinecraftApi";
import JsonView from "./JsonView";
import Timestamp from "./Timestamp";

const runtimeVersionCollator = new Intl.Collator(undefined, { numeric: true });

interface RuntimeRow extends JavaRuntime {
    platform: string;
    component: string;
    key: string;
}

export default function RuntimeMetadata() {
    const selection = useObservable(launcherSelection);
    const runtimes = useObservable(launcherRuntimes);
    const runtimeSort = useObservable(launcherRuntimeSort);
    if (!runtimes || runtimes.status === "loading") {
        return <Spin />;
    }
    if (runtimes.status === "error") {
        return <Alert type="error" title={runtimes.error} />;
    }
    const { data, lastModified } = runtimes.data;
    const platforms = Object.keys(data);
    const rows: RuntimeRow[] = [];
    for (const [platform, components] of Object.entries(data)) {
        const includePlatform = selection.view === "json" || selection.platform === "all" || platform === selection.platform;
        if (!includePlatform) {
            continue;
        }
        for (const [component, entries] of Object.entries(components)) {
            for (const [index, entry] of entries.entries()) {
                rows.push({ ...entry, platform, component, key: `${platform}:${component}:${index}` });
            }
        }
    }
    const releases = rows.map(row => row.version.released).sort();
    const newestRelease = releases.at(-1);
    const indexUpdated = lastModified ? <Timestamp value={new Date(lastModified).toISOString()} /> : "Unavailable";
    const columns: TableColumnsType<RuntimeRow> = [
        { title: "Platform", dataIndex: "platform", key: "platform", sorter: (left, right) => left.platform.localeCompare(right.platform) },
        { title: "Component", dataIndex: "component", key: "component", sorter: (left, right) => left.component.localeCompare(right.component) },
        {
            title: "Java version",
            key: "version",
            render: (_, row) => row.version.name,
            sorter: (left, right) => runtimeVersionCollator.compare(left.version.name, right.version.name),
        },
        {
            title: "Released",
            key: "released",
            render: (_, row) => <Timestamp value={row.version.released} />,
            sorter: (left, right) => Date.parse(left.version.released) - Date.parse(right.version.released),
        },
        {
            title: "Rollout",
            key: "rollout",
            render: (_, row) => `${row.availability.progress}% (group ${row.availability.group})`,
            sorter: (left, right) => {
                const progressOrder = left.availability.progress - right.availability.progress;
                if (progressOrder) {
                    return progressOrder;
                }
                return left.availability.group - right.availability.group;
            },
        },
        { title: "Manifest", key: "manifest", render: (_, row) => <Typography.Link href={row.manifest.url} target="_blank" rel="noreferrer">JSON</Typography.Link> },
    ];
    return (
        <>
            <Flex align="center" gap="middle" wrap flex="none">
                {selection.view === "summary" && (
                    <Select
                        aria-label="Runtime platform"
                        value={selection.platform}
                        style={{ width: 200 }}
                        options={[{ value: "all", label: "All platforms" }, ...platforms.map(platform => ({ value: platform, label: platform }))]}
                        onChange={platform => updateLauncherSelection({ platform })}
                    />
                )}
                <Typography.Text type="secondary">Index updated: {indexUpdated}</Typography.Text>
                {newestRelease && <Typography.Text type="secondary">Latest runtime release: <Timestamp value={newestRelease} /></Typography.Text>}
            </Flex>
            {selection.view === "json" ? <JsonView left={data} /> : (
                <Flex vertical flex={1} style={{ minHeight: 0, overflow: "auto" }}>
                    <Table
                        size="small"
                        bordered
                        pagination={false}
                        dataSource={rows}
                        rowKey="key"
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No runtimes for this platform" /> }}
                        columns={columns.map(column => ({
                            ...column,
                            sortOrder: runtimeSort && runtimeSort.column === column.key ? runtimeSort.order : null,
                        }))}
                        onChange={(_pagination, _filters, sorter) => {
                            const activeSort = Array.isArray(sorter) ? sorter[0] : sorter;
                            if (activeSort.order && activeSort.columnKey) {
                                launcherRuntimeSort.next({ column: String(activeSort.columnKey), order: activeSort.order });
                            } else {
                                launcherRuntimeSort.next(null);
                            }
                        }}
                    />
                </Flex>
            )}
        </>
    );
}
