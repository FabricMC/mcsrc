import { Divider, Flex, Radio, Space, Tag, Typography } from "antd";
import { activeJavadocFile } from "../../javadoc/Javadoc";
import { bytecode, displayLambdas, renderJavadoc, showClassHistoryIcons, showInheritanceIcons } from "../../logic/Settings";
import { useObservable } from "../../utils/UseObservable";
import { SettingSwitch } from "./SettingsControls";

type SourceDisplay = 'standard' | 'lambdas' | 'bytecode';

const CodeSettings = () => {
    const displayLambdasValue = useObservable(displayLambdas.observable);
    const bytecodeValue = useObservable(bytecode.observable);
    const javadocMode = useObservable(activeJavadocFile) !== null;
    let sourceDisplay: SourceDisplay = 'standard';

    if (bytecodeValue) {
        sourceDisplay = 'bytecode';
    } else if (displayLambdasValue) {
        sourceDisplay = 'lambdas';
    }

    const changeSourceDisplay = (value: SourceDisplay) => {
        // Clear the previous mode before enabling another to keep them mutually exclusive.
        displayLambdas.value = false;
        bytecode.value = false;

        if (value === 'lambdas') {
            displayLambdas.value = true;
        } else if (value === 'bytecode') {
            bytecode.value = true;
        }
    };

    return (
        <Flex vertical gap="large">
            <Flex vertical gap="middle">
                <Radio.Group
                    aria-label="Decompiler output"
                    value={sourceDisplay}
                    onChange={event => changeSourceDisplay(event.target.value as SourceDisplay)}
                >
                    <Flex vertical gap="middle">
                        <Radio styles={{ icon: { alignSelf: 'flex-start', marginTop: 4 } }} value="standard">
                            <Flex vertical gap={4}>
                                <Space>Standard source<Tag>Default</Tag></Space>
                                <Typography.Text type="secondary">Decompile to Java source with stable permalinks.</Typography.Text>
                            </Flex>
                        </Radio>
                        <Radio styles={{ icon: { alignSelf: 'flex-start', marginTop: 4 } }} value="lambdas">
                            <Flex vertical gap={4}>
                                <span>Source with lambda names</span>
                                <Typography.Text type="secondary">Include generated lambda names as inline comments. Permalinks are unavailable.</Typography.Text>
                            </Flex>
                        </Radio>
                        <Radio styles={{ icon: { alignSelf: 'flex-start', marginTop: 4 } }} value="bytecode" disabled={javadocMode}>
                            <Flex vertical gap={4}>
                                <span>Bytecode</span>
                                <Typography.Text type="secondary">
                                    Show JVM instructions instead of Java source. Permalinks are unavailable.
                                    {javadocMode && ' Unavailable in Javadoc mode.'}
                                </Typography.Text>
                            </Flex>
                        </Radio>
                    </Flex>
                </Radio.Group>
            </Flex>
            <Divider style={{ marginBlock: 0 }} />
            <Flex vertical gap="middle">
                {javadocMode && <SettingSwitch setting={renderJavadoc} title="Render Javadoc" description="Display formatted documentation comments instead of raw Markdown." />}
                <SettingSwitch setting={showInheritanceIcons} title="Inheritance icons" description="Add clickable markers beside declarations to navigate to parent types and overriding methods." />
                <SettingSwitch setting={showClassHistoryIcons} title="Class history icons" description="Add a clickable marker beside a class declaration to browse its history across Minecraft versions." />
            </Flex>
        </Flex>
    );
};

export default CodeSettings;
