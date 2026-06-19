import { Flex, Button, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";
import VersionSelector from "../VersionSelector";

const DiffVersionSelection = () => {
    return (
        <Flex align="center" gap={8}>
            <VersionSelector selectedVersion={getLeftDiff().selectedVersion} minWidth={96} />
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
            <VersionSelector selectedVersion={getRightDiff().selectedVersion} minWidth={96} />
        </Flex>
    );
};

export default DiffVersionSelection;
