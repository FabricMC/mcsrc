import { Button, Divider, Flex, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { SettingsModalButton } from "./SettingsModal";
import { JarDecompilerModalButton } from "./JarDecompilerModal";
import VersionSelector from "./VersionSelector";
import { diffView } from "../logic/State";

const Header = () => {
    return (
        <div>
            <Flex style={{ width: "100%", paddingTop: 8 }}>
                <div style={{ width: "100%", minWidth: 0, overflowX: "auto", overflowY: "hidden" }}>
                    <HeaderBody />
                </div>
            </Flex>
            <Divider size="small" />
        </div>
    );
};

const HeaderBody = () => {
    return (
        <Flex justify="center" align="center" gap={6} style={{ width: "max-content", minWidth: "100%" }}>
            <div style={{ flex: "0 0 auto" }}>
                <VersionSelector />
            </div>
            <Tooltip title="Compare versions">
                <Button
                    icon={<SwapOutlined />}
                    onClick={() => diffView.next(true)}
                >
                    Compare
                </Button>
            </Tooltip>
            <div style={{ flex: "0 0 auto" }}>
                <JarDecompilerModalButton />
            </div>
            <div style={{ flex: "0 0 auto" }}>
                <SettingsModalButton />
            </div>
        </Flex>
    );
};

export default Header;
