import { Button, Divider, Flex, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { SettingsModalButton } from "./SettingsModal";
import VersionSelector from "./VersionSelector";
import { diffView } from "../logic/State";
import { activeJavadocFile } from "../javadoc/Javadoc";
import { useObservable } from "../utils/UseObservable";

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
    const javadocMode = useObservable(activeJavadocFile) !== null;

    return (
        <Flex justify="center" align="center" gap={6} style={{ width: "max-content", minWidth: "100%" }}>
            <div style={{ flex: "0 0 auto" }}>
                <Tooltip title={javadocMode ? "Version selection is unavailable in Javadoc mode" : undefined}>
                    <span>
                        <VersionSelector disabled={javadocMode} />
                    </span>
                </Tooltip>
            </div>
            <Tooltip title={javadocMode ? "Version comparison is unavailable in Javadoc mode" : "Compare versions"}>
                <Button
                    disabled={javadocMode}
                    icon={<SwapOutlined />}
                    onClick={() => diffView.next(true)}
                >
                    Compare
                </Button>
            </Tooltip>
            <div style={{ flex: "0 0 auto" }}>
                <SettingsModalButton />
            </div>
        </Flex>
    );
};

export default Header;
