import { Alert, Button, Checkbox, Flex, Spin } from "antd";
import { CloseOutlined, SwapOutlined } from "@ant-design/icons";
import { useObservable } from "../../utils/UseObservable";
import {
    launcherLeft, launcherLeftVersion, launcherRight, launcherRightVersion, launcherSelection,
    launcherVersionList, launcherVersions, updateLauncherSelection,
} from "../../logic/LauncherMeta";
import VersionSelector from "../VersionSelector";
import JsonView from "./JsonView";
import VersionSummary from "./VersionSummary";

export default function VersionMetadata() {
    const selection = useObservable(launcherSelection);
    const versions = useObservable(launcherVersions);
    const leftVersion = useObservable(launcherLeftVersion);
    const rightVersion = useObservable(launcherRightVersion);
    const left = useObservable(launcherLeft);
    const right = useObservable(launcherRight);
    const error = [versions, left, right].find(state => state?.status === "error");
    const comparing = Boolean(rightVersion);

    let content;
    if (error?.status === "error") {
        content = <Alert type="error" title={error.error} />;
    } else if (left?.status !== "ready" || !left.data || right?.status !== "ready") {
        content = <Spin />;
    } else if (selection.view === "json") {
        content = <JsonView left={left.data} right={right.data ?? undefined} />;
    } else {
        content = (
            <VersionSummary
                left={left.data}
                right={right.data ?? undefined}
                rightVersion={rightVersion}
                comparing={comparing}
                changesOnly={selection.changesOnly}
            />
        );
    }

    function swapVersions() {
        let currentLeft = leftVersion;
        if (currentLeft == null && versions?.status === "ready") {
            currentLeft = versions.data[0]?.id ?? null;
        }
        launcherLeftVersion.next(rightVersion);
        launcherRightVersion.next(currentLeft ?? null);
    }

    return (
        <>
            <Flex gap="small" align="center" wrap flex="none">
                <VersionSelector
                    selectedVersion={launcherLeftVersion}
                    versions={launcherVersionList}
                    ariaLabel="Launcher version"
                    minWidth={200}
                />
                <Button
                    aria-label="Swap launcher versions"
                    icon={<SwapOutlined />}
                    disabled={!comparing}
                    onClick={swapVersions}
                />
                <VersionSelector
                    selectedVersion={launcherRightVersion}
                    versions={launcherVersionList}
                    ariaLabel="Compare launcher version"
                    placeholder="Compare with…"
                    minWidth={200}
                />
                {comparing && (
                    <Button
                        aria-label="Clear launcher comparison"
                        icon={<CloseOutlined />}
                        onClick={() => launcherRightVersion.next(null)}
                    />
                )}
                {comparing && selection.view === "summary" && (
                    <Checkbox
                        checked={selection.changesOnly}
                        onChange={event => updateLauncherSelection({ changesOnly: event.target.checked })}
                    >
                        Changes only
                    </Checkbox>
                )}
            </Flex>
            {content}
        </>
    );
}
