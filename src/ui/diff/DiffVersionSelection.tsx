import { Select, Flex, Button, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { useObservable } from "../../utils/UseObservable";
import { minecraftVersionIds } from "../../logic/MinecraftApi";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";

const DiffVersionSelection = () => {
    const versions = useObservable(minecraftVersionIds);
    const leftVersion = useObservable(getLeftDiff().selectedVersion);
    const rightVersion = useObservable(getRightDiff().selectedVersion);

    if (!leftVersion) {
        // This will trigger the jar to load
        getLeftDiff().selectedVersion.next(versions?.[1] || null);
    }

    return (
        <Flex align="center" gap={8}>
            <Select
                value={leftVersion || versions?.[1]} // Select second version as default for left side
                onChange={(v) => {
                    getLeftDiff().selectedVersion.next(v);
                }}
            >
                {versions?.map(v => (
                    <Select.Option key={v} value={v}>{v}</Select.Option>
                ))}
            </Select>
            <Tooltip title="Swap versions">
                <Button
                    icon={<SwapOutlined />}
                    size="small"
                    onClick={() => {
                        const left = getLeftDiff().selectedVersion.getValue();
                        const right = getRightDiff().selectedVersion.getValue();
                        getLeftDiff().selectedVersion.next(right);
                        getRightDiff().selectedVersion.next(left);
                    }}
                />
            </Tooltip>
            <Select
                value={rightVersion || versions?.[0]}
                onChange={(v) => {
                    getRightDiff().selectedVersion.next(v);
                }}
            >
                {versions?.map(v => (
                    <Select.Option key={v} value={v}>{v}</Select.Option>
                ))}
            </Select>
        </Flex>
    );
};

export default DiffVersionSelection;
