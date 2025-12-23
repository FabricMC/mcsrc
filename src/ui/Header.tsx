import { Divider, Flex, Select, Space } from "antd";
import { minecraftVersionIds, selectedMinecraftVersion } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";
import AboutModal from "./AboutModal";
import SettingsModal from "./SettingsModal";
import { diffView } from "../logic/Diff";

const Header = () => {
    return (
        <div>
            <Flex justify="center" style={{ width: '100%', paddingTop: 8 }}>
                <HeaderBody />
            </Flex>
            <Divider size="small" />
        </div>
    );
};

export const HeaderBody = () => {
    const versions = useObservable(minecraftVersionIds);
    const currentVersion = useObservable(selectedMinecraftVersion);
    return (
        <Space align="center">
            <Select
                value={currentVersion || versions?.[0]}
                onChange={(v) => {
                    if (v == "diff") {
                        diffView.next(true);
                        return;
                    }

                    console.log(`Selected Minecraft version: ${v}`);
                    selectedMinecraftVersion.next(v);
                }}
            >
                <Select.Option key={"diff"} value={"diff"}>Compare</Select.Option>
                {versions?.map(v => (
                    <Select.Option key={v} value={v}>{v}</Select.Option>
                ))}
            </Select>
            <SettingsModal />
            <AboutModal />
        </Space>
    );
};

export default Header;