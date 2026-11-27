import { Tooltip } from "antd";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export default function Timestamp({ value }: { value: string }) {
    return (
        <Tooltip title={() => dayjs(value).fromNow()} fresh trigger={["hover", "focus"]}>
            <time dateTime={value} tabIndex={0}>{value}</time>
        </Tooltip>
    );
}
