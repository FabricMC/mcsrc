import { CloseOutlined, FileTextOutlined, JavaOutlined } from "@ant-design/icons";
import { Button, Divider, Flex, Space, Tag, Typography } from "antd";
import { activeJavadocFile, deactivateJavadocFile } from "../../javadoc/Javadoc";
import JavadocFilePicker from "../../javadoc/JavadocFilePicker";
import { openLauncherMeta } from "../../logic/LauncherMeta";
import { useObservable } from "../../utils/UseObservable";
import { modalOpen } from "../JarDecompilerModal";

const ToolsSettings = ({ onClose }: { onClose: () => void }) => {
    const javadocFile = useObservable(activeJavadocFile);

    return (
        <Flex vertical gap="large">
            <Flex vertical align="flex-start" gap="middle">
                <Typography.Text strong>Launcher metadata</Typography.Text>
                <Typography.Text type="secondary">
                    Inspect version manifests, libraries, launch arguments, and Java runtime downloads.
                </Typography.Text>
                <Button
                    icon={<FileTextOutlined />}
                    onClick={() => {
                        onClose();
                        openLauncherMeta();
                    }}
                >
                    Open metadata explorer
                </Button>
            </Flex>
            <Divider style={{ marginBlock: 0 }} />
            <Flex vertical gap="middle">
                <Space>
                    <Typography.Text strong>JavaDoc</Typography.Text>
                    {javadocFile && <Tag>Active</Tag>}
                </Space>
                <Typography.Text type="secondary">
                    Open or create Tiny v2 or Enigma mappings, or load an Annotater project to view and edit documentation.
                </Typography.Text>
                <Flex wrap gap="small">
                    <JavadocFilePicker onOpen={onClose} />
                    {javadocFile && <Button icon={<CloseOutlined />} onClick={deactivateJavadocFile}>
                        Exit Javadoc mode
                    </Button>}
                </Flex>
            </Flex>
            <Divider style={{ marginBlock: 0 }} />
            <Flex vertical align="flex-start" gap="middle">
                <Space>
                    <Typography.Text strong>Decompile entire JAR</Typography.Text>
                    <Tag color="orange">Experimental</Tag>
                </Space>
                <Typography.Text type="secondary">
                    Decompile every class in the selected JAR and cache the results for later browsing.
                </Typography.Text>
                <Button
                    data-testid="jar-decompiler"
                    icon={<JavaOutlined />}
                    onClick={() => modalOpen.next(true)}
                >
                    Configure decompilation…
                </Button>
            </Flex>
        </Flex>
    );
};

export default ToolsSettings;
