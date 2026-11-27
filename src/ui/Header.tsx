import { Button, Divider, Flex, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { SettingsModalButton } from "./settings/SettingsModal";
import VersionSelector from "./VersionSelector";
import { diffView } from "../logic/State";
import { activeJavadocFile } from "../javadoc/JavadocState";
import { useObservable } from "../utils/UseObservable";
import { showAnnotaterShortcut } from "../logic/Settings";
import JavadocFilePicker from "../javadoc/JavadocFilePicker";
import { UnpickEditorButton } from "../unpick/UnpickView";

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
    const showAnnotaterShortcutValue = useObservable(showAnnotaterShortcut.observable);

    return (
        <Flex justify="center" align="center" gap={6} style={{ width: "max-content", minWidth: "100%" }}>
            <div style={{ flex: "0 0 auto" }}>
                <Tooltip title={javadocMode ? "Version selection is unavailable in Javadoc mode" : undefined}>
                    <span>
                        <VersionSelector disabled={javadocMode} />
                    </span>
                </Tooltip>
            </div>
            {!javadocMode && (
                <Tooltip title="Compare versions">
                    <Button
                        icon={<SwapOutlined />}
                        onClick={() => diffView.next(true)}
                    >
                        Compare
                    </Button>
                </Tooltip>
            )}
            {(showAnnotaterShortcutValue || javadocMode) && <JavadocFilePicker annotaterShortcut />}
            <UnpickEditorButton />
            <div style={{ flex: "0 0 auto" }}>
                <SettingsModalButton />
            </div>
        </Flex>
    );
};

export default Header;
