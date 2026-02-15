import { Table, Tag, Input, Button, Flex, theme, Checkbox, Tooltip, Layout, Space } from "antd";
import {
  SplitCellsOutlined,
  AlignLeftOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CodeOutlined,
  FileTextOutlined,
} from "@ant-design/icons";
import DiffVersionSelection from "./DiffVersionSelection";
import {
  getDiffChanges,
  type ChangeState,
  type ChangeInfo,
  hideUnchangedSizes,
  getDiffSummary,
  type DiffSummary,
} from "../../logic/Diff";
import { BehaviorSubject, map, combineLatest } from "rxjs";
import { useObservable } from "../../utils/UseObservable";
import type { SearchProps } from "antd/es/input";
import { isDecompiling } from "../../logic/Decompiler.ts";
import { useEffect, useMemo } from "react";
import { bytecode, unifiedDiff } from "../../logic/Settings.ts";
import { selectedFile, diffView } from "../../logic/State.ts";

const statusColors: Record<ChangeState, string> = {
  modified: "gold",
  added: "green",
  deleted: "red",
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
  }),
);

const DiffFileList = () => {
  const dataSource = useObservable(entries) || [];
  const currentFile = useObservable(selectedFile);
  const loading = useObservable(isDecompiling);
  const hideUnchanged = useObservable(hideUnchangedSizes) || false;
  const summary = useObservable<DiffSummary>(useMemo(() => getDiffSummary(), []));
  const isUnifiedDiff = useObservable(unifiedDiff.observable);
  const isBytecode = useObservable(bytecode.observable);
  const { token } = theme.useToken();

  const columns = useMemo(
    () => [
      {
        title: "File",
        dataIndex: "file",
        key: "file",
        render: (file: string) => (
          <span style={{ color: token.colorText }}>{file.replace(".class", "")}</span>
        ),
      },
      {
        title: "Status",
        dataIndex: "statusInfo",
        key: "status",
        render: (info: ChangeInfo) => (
          <Flex gap={6} align="center">
            <Tag color={statusColors[info.state] || "default"} style={{ marginRight: 0 }}>
              {info.state.toUpperCase()}
            </Tag>
            {info.deletions !== undefined && info.deletions > 0 && (
              <span style={{ color: token.colorError, fontSize: "12px", fontWeight: "bold" }}>
                -{info.deletions}
              </span>
            )}
            {info.additions !== undefined && info.additions > 0 && (
              <span style={{ color: token.colorSuccess, fontSize: "12px", fontWeight: "bold" }}>
                +{info.additions}
              </span>
            )}
            {info.state === "modified" && info.additions === 0 && info.deletions === 0 && (
              <span
                style={{ color: token.colorTextDescription, fontSize: "12px", fontStyle: "italic" }}
              >
                None
              </span>
            )}
          </Flex>
        ),
      },
    ],
    [token],
  );

  const onChange: SearchProps["onChange"] = (e) => {
    searchQuery.next(e.target.value);
  };

  const handleExitDiff = () => {
    diffView.next(false);
  };

  useEffect(() => {
    if (dataSource.length > 500 && !hideUnchanged) {
      hideUnchangedSizes.next(true);
    }
  }, [dataSource.length, hideUnchanged]);

  return (
    <Layout style={{ height: "100%", backgroundColor: token.colorBgContainer }}>
      <Layout.Header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: token.colorBgContainer,
          padding: "12px 8px",
          height: "auto",
          lineHeight: "normal",
        }}
      >
        <Flex wrap="wrap" gap={12} justify="center" align="center" style={{ width: "100%" }}>
          <Flex
            align="center"
            gap={8}
            wrap="wrap"
            style={{ flex: "1 1 0", minWidth: "max-content", justifyContent: "flex-start" }}
          >
            <Input.Search
              placeholder="Search"
              allowClear
              onChange={onChange}
              style={{ width: 160 }}
            />
            {summary && (
              <Flex
                vertical
                gap={0}
                style={{ color: token.colorTextDescription, fontSize: "10px", lineHeight: "1.2" }}
              >
                {summary.added === 0 && summary.deleted === 0 && summary.modified === 0 ? (
                  <span>None</span>
                ) : (
                  <>
                    <span style={{ color: token.colorSuccess }}>+{summary.added} new files</span>
                    <span style={{ color: token.colorError }}>-{summary.deleted} deleted</span>
                    <span>{summary.modified} modified</span>
                  </>
                )}
              </Flex>
            )}
          </Flex>

          <Flex style={{ flex: "0 1 auto", minWidth: "max-content" }}>
            <DiffVersionSelection />
          </Flex>

          <Flex
            gap={0}
            wrap="wrap"
            justify="flex-end"
            style={{ flex: "1 1 0", minWidth: "max-content" }}
          >
            <Tooltip
              title={isUnifiedDiff ? "Switch to side-by-side diff" : "Switch to unified diff"}
            >
              <Button
                type="text"
                icon={isUnifiedDiff ? <SplitCellsOutlined /> : <AlignLeftOutlined />}
                onClick={() => (unifiedDiff.value = !unifiedDiff.value)}
              />
            </Tooltip>
            <Tooltip title={isBytecode ? "Show decompiled code" : "Show bytecode"}>
              <Button
                type="text"
                icon={isBytecode ? <FileTextOutlined /> : <CodeOutlined />}
                onClick={() => (bytecode.value = !bytecode.value)}
              />
            </Tooltip>
            <Tooltip
              title={
                hideUnchanged
                  ? "Show all modified classes"
                  : "Hide modified classes that have the same uncompressed size"
              }
            >
              <Button
                type="text"
                icon={hideUnchanged ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={() => hideUnchangedSizes.next(!hideUnchanged)}
              />
            </Tooltip>
            <Button
              type="default"
              variant={"outlined"}
              onClick={handleExitDiff}
              style={{ marginLeft: 8 }}
            >
              Exit
            </Button>
          </Flex>
        </Flex>
      </Layout.Header>

      <Layout.Content
        style={{
          padding: "0 8px",
          overflowY: "auto",
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
          rowClassName={(record) => (currentFile === record.file ? "ant-table-row-selected" : "")}
          onRow={(record) => ({
            onClick: () => {
              if (loading) return;
              if (currentFile === record.file) return;

              selectedFile.next(record.file);
            },
          })}
          style={{
            cursor: loading ? "not-allowed" : "pointer",
          }}
        />
      </Layout.Content>
    </Layout>
  );
};

export default DiffFileList;
