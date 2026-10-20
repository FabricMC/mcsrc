import { Col, Flex, Row, Table, Tag, Typography, type TableColumnsType } from "antd";
import { useObservable } from "../../utils/UseObservable";
import {
    compareLibraryVersion, compareMetadata, expandedLauncherLibraries, libraryVersions,
    type MetadataRow,
} from "../../logic/LauncherMeta";
import type { Manifest } from "../../logic/MinecraftApi";
import { LibraryDetails, LibrarySummary } from "./LibraryMetadata";
import MetadataValue from "./MetadataValue";

const statusColors = { added: "green", removed: "red", changed: "gold", unchanged: "default" };
const versionChangeColors = { major: "red", minor: "orange", patch: "blue", qualifier: "blue", revision: "purple", version: "gold" };

function MetadataChange({ row }: { row: MetadataRow }) {
    if (row.section === "Libraries" && row.status === "changed") {
        const leftVersions = libraryVersions(row.left);
        const rightVersions = libraryVersions(row.right);
        if (leftVersions.length === 1 && rightVersions.length === 1) {
            const kind = compareLibraryVersion(rightVersions[0], leftVersions[0]);
            if (kind) {
                return <Tag color={versionChangeColors[kind]}>{kind}</Tag>;
            }
        }
    }
    return <Tag color={statusColors[row.status]}>{row.status}</Tag>;
}

interface VersionSummaryProps {
    left: Manifest;
    right?: Manifest;
    rightVersion: string | null;
    comparing: boolean;
    changesOnly: boolean;
}

export default function VersionSummary({ left, right, rightVersion, comparing, changesOnly }: VersionSummaryProps) {
    const expandedLibraries = useObservable(expandedLauncherLibraries);
    const rows = compareMetadata(left, right);
    const columns: TableColumnsType<MetadataRow> = [
        { title: "Entry", dataIndex: "label", key: "label", width: comparing ? "24%" : "30%" },
    ];
    if (comparing) {
        columns.push({
            title: "Change",
            key: "status",
            width: 100,
            render: (_, row) => <MetadataChange row={row} />,
        });
    }
    columns.push({
        title: String(left.id),
        key: "left",
        render: (_, row) => {
            if (row.section === "Libraries") {
                return <LibrarySummary value={row.left} other={row.right} status={row.status} />;
            }
            return <MetadataValue value={row.left} label={row.label} />;
        },
    });
    if (comparing) {
        columns.push({
            title: rightVersion,
            key: "right",
            render: (_, row) => {
                if (row.section === "Libraries") {
                    return <LibrarySummary value={row.right} other={row.left} status={row.status} />;
                }
                return <MetadataValue value={row.right} label={row.label} />;
            },
        });
    }

    const sections: MetadataRow["section"][] = ["Options", "Libraries", "Game arguments", "JVM arguments"];
    return (
        <Flex vertical gap="middle" flex={1} style={{ minHeight: 0, overflow: "auto", overflowWrap: "anywhere" }}>
            {sections.map(section => {
                const sectionRows = rows.filter(row => row.section === section);
                const changedRows = sectionRows.filter(row => row.status !== "unchanged");
                const visibleRows = comparing && changesOnly ? changedRows : sectionRows;
                const entryCount = comparing ? `${changedRows.length} changes` : `${sectionRows.length} entries`;
                const isLibrarySection = section === "Libraries";
                const isArgumentSection = section === "JVM arguments" || section === "Game arguments";
                const sectionColumns = isArgumentSection ? columns.filter(column => column.key !== "label") : columns;

                return (
                    <Flex component="section" vertical gap="small" flex="none" key={section}>
                        <Flex align="center" gap="small">
                            <Typography.Text strong>{section}</Typography.Text>
                            <Typography.Text type="secondary">{entryCount}</Typography.Text>
                        </Flex>
                        {visibleRows.length > 0 ? (
                            <Table
                                size="small"
                                bordered
                                pagination={false}
                                rowKey="key"
                                dataSource={visibleRows}
                                columns={sectionColumns}
                                tableLayout="fixed"
                                onRow={isLibrarySection ? row => ({
                                    tabIndex: 0,
                                    "aria-expanded": expandedLibraries.includes(row.key),
                                    onKeyDown: event => {
                                        const isToggleKey = event.key === "Enter" || event.key === " ";
                                        if (event.target !== event.currentTarget || !isToggleKey) {
                                            return;
                                        }
                                        event.preventDefault();
                                        const expandedKeys = expandedLauncherLibraries.value;
                                        const nextExpandedKeys = expandedKeys.includes(row.key)
                                            ? expandedKeys.filter(key => key !== row.key) : [...expandedKeys, row.key];
                                        expandedLauncherLibraries.next(nextExpandedKeys);
                                    },
                                }) : undefined}
                                expandable={isLibrarySection ? {
                                    showExpandColumn: false,
                                    expandRowByClick: true,
                                    expandedRowKeys: expandedLibraries,
                                    onExpandedRowsChange: keys => expandedLauncherLibraries.next(keys.map(String)),
                                    expandedRowRender: row => (
                                        <Row gutter={16}>
                                            <Col span={comparing ? 12 : 24}>
                                                <LibraryDetails value={row.left} />
                                            </Col>
                                            {comparing && (
                                                <Col span={12}>
                                                    <LibraryDetails value={row.right} />
                                                </Col>
                                            )}
                                        </Row>
                                    ),
                                } : undefined}
                            />
                        ) : (
                            <Typography.Text type="secondary">{comparing ? "No changes" : "None"}</Typography.Text>
                        )}
                    </Flex>
                );
            })}
        </Flex>
    );
}
