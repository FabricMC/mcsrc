import { Flex, Modal, Segmented, Tabs } from "antd";
import { useObservable } from "../../utils/UseObservable";
import { launcherMetaOpen, launcherSelection, updateLauncherSelection } from "../../logic/LauncherMeta";
import VersionMetadata from "./VersionMetadata";
import RuntimeMetadata from "./RuntimeMetadata";

export default function LauncherMetaModal() {
    const open = useObservable(launcherMetaOpen);
    const selection = useObservable(launcherSelection);
    return (
        <Modal
            title="Minecraft launcher metadata"
            open={open}
            footer={null}
            width="94vw"
            style={{ top: "3vh", paddingBottom: 0 }}
            destroyOnHidden
            onCancel={() => launcherMetaOpen.next(false)}
        >
            {open && (
                <Flex vertical gap="small" style={{ height: "80vh", minHeight: 0 }}>
                    <Flex justify="space-between" align="center" gap="small" flex="none" wrap>
                        <Tabs
                            activeKey={selection.tab}
                            onChange={tab => updateLauncherSelection({ tab: tab as "versions" | "java" })}
                            items={[{ key: "versions", label: "Minecraft versions" }, { key: "java", label: "Java runtimes" }]}
                        />
                        <Flex gap={8}>
                            <Segmented
                                options={[{ value: "summary", label: "Summary" }, { value: "json", label: "Raw JSON" }]}
                                value={selection.view}
                                onChange={view => updateLauncherSelection({ view: view as "summary" | "json" })}
                            />
                        </Flex>
                    </Flex>
                    {selection.tab === "versions" ? <VersionMetadata /> : <RuntimeMetadata />}
                </Flex>
            )}
        </Modal>
    );
}
