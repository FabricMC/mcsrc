import { Divider, Flex, Select, Space } from "antd";
import { minecraftVersionIds, selectedMinecraftVersion } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";
import { AboutModalButton } from "./AboutModal";
import { SettingsModalButton } from "./SettingsModal";
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
            <div style={{ display: "grid" }}>
                {/* These invisible spans are layered on top of each other in the same grid
                space which auto-sizes the parent to the width of the largest item.
                The Select - taking up 100% of the parent - will then get the width of
                the largest item (>ᴗ•) */}
                {versions?.map(v => (
                    <span key={v} style={{
                        gridArea: "1/1",
                        visibility: "hidden",
                        paddingRight: "42px" // Safety padding for the caret
                    }}>{v}</span>
                ))}
                <Select
                    style={{ gridArea: "1/1", width: "100%" }}
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
            </div>
            <SettingsModalButton />
            <AboutModalButton />
        </Space>
    );
};

export default Header;