import { Flex, Button, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";
import { minecraftVersions } from "../../logic/MinecraftApi";
import VersionSelector from "../VersionSelector";
import { swapDiffSelectionSideIfPresent } from "../../logic/State";
import { useObservable } from "../../utils/UseObservable";
import VersionComparisonMenu from "../VersionComparisonMenu";

const DiffVersionSelection = () => {
    const versions = useObservable(minecraftVersions) ?? [];

    return (
        <Flex align="center" gap={8}>
            <VersionSelector selectedVersion={getLeftDiff().selectedVersion} minWidth={96} />
            <Tooltip title="Swap versions (right-click for common comparisons)">
                <VersionComparisonMenu
                    versions={versions}
                    onSelect={({ left, right }) => {
                        getLeftDiff().selectedVersion.next(left);
                        getRightDiff().selectedVersion.next(right);
                    }}
                >
                    <Button
                        aria-label="Swap versions"
                        icon={<SwapOutlined />}
                        size="small"
                        onClick={() => {
                            const left = getLeftDiff().selectedVersion.getValue();
                            const right = getRightDiff().selectedVersion.getValue();
                            getLeftDiff().selectedVersion.next(right);
                            getRightDiff().selectedVersion.next(left);

                            swapDiffSelectionSideIfPresent();
                        }}
                    />
                </VersionComparisonMenu>
            </Tooltip>
            <VersionSelector selectedVersion={getRightDiff().selectedVersion} minWidth={96} />
        </Flex>
    );
};

export default DiffVersionSelection;
