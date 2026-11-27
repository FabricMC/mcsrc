import { Typography } from "antd";
import type { Json } from "../../logic/MinecraftApi";

export default function JsonBlock({ value, secondary = false }: { value: Json; secondary?: boolean }) {
    return (
        <Typography.Paragraph type={secondary ? "secondary" : undefined}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {JSON.stringify(value, null, 2)}
            </pre>
        </Typography.Paragraph>
    );
}
