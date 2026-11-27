import { Tooltip, Typography } from "antd";
import dayjs from "dayjs";
import type { Json } from "../../logic/MinecraftApi";
import Timestamp from "./Timestamp";
import JsonBlock from "./JsonBlock";

function formatDownloadSize(bytes: number) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1000 && unitIndex < units.length - 1) {
        size /= 1000;
        unitIndex++;
    }
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(size)}${units[unitIndex]}`;
}

export default function MetadataValue({ value, label }: { value: Json | undefined; label?: string }) {
    if (value === undefined) {
        return <Typography.Text type="secondary">—</Typography.Text>;
    }
    if (label && /^downloads\.[^.]+\.url$/.test(label) && typeof value === "string" && /^https?:\/\//i.test(value)) {
        return <Typography.Link href={value} target="_blank" rel="noreferrer" code>{value}</Typography.Link>;
    }
    if (label && /^downloads\.[^.]+\.size$/.test(label) && typeof value === "number" && Number.isFinite(value) && value >= 0) {
        return (
            <Tooltip title={formatDownloadSize(value)} trigger={["hover", "focus"]}>
                <Typography.Text code tabIndex={0}>{value}</Typography.Text>
            </Tooltip>
        );
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && dayjs(value).isValid()) {
        return <Typography.Text code><Timestamp value={value} /></Typography.Text>;
    }
    if (value === null || typeof value !== "object") {
        return <Typography.Text code>{String(value)}</Typography.Text>;
    }
    if (!Array.isArray(value) && typeof value.name === "string") {
        return <Typography.Text code>{value.name}</Typography.Text>;
    }
    if (!Array.isArray(value) && value.value !== undefined) {
        const argumentText = Array.isArray(value.value) ? value.value.join(" ") : String(value.value);
        return (
            <div>
                <Typography.Text code>{argumentText}</Typography.Text>
                {value.rules !== undefined && <JsonBlock value={value.rules} secondary />}
            </div>
        );
    }
    return <JsonBlock value={value} />;
}
