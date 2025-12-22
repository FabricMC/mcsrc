import { Button, Modal, type CheckboxProps } from "antd";
import { useState } from "react";
import { SettingOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { useObservable } from "../utils/UseObservable";
import { BooleanSetting, enableTabs } from "../logic/Settings";
import { minecraftJar } from "../logic/MinecraftApi";
import { refreshIndex } from "../logic/UsageIndex";

const SettingsModal = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const jar = useObservable(minecraftJar);

    const doIndex = async () => {
        if (jar) {
            refreshIndex(jar);
            setIsModalOpen(false);
        }
    };

    return (
        <>
            <Button type="default" onClick={() => setIsModalOpen(true)}>
                <SettingOutlined />
            </Button>
            <Modal
                title="Settings"
                open={isModalOpen}
                onCancel={() => setIsModalOpen(false)}
                footer={null}
            >
                <Setting setting={enableTabs} title={"Enable Tabs"} />
                {jar && (
                    <Button type="default" onClick={doIndex} style={{ marginLeft: '8px' }}>
                        Re-index Jar
                    </Button>
                )}
            </Modal>
        </>
    );
};

interface SettingProps {
    setting: BooleanSetting;
    title: string;
}

const Setting: React.FC<SettingProps> = ({ setting, title }) => {
    const value = useObservable(setting.observable);
    const onChange: CheckboxProps['onChange'] = (e) => {
        setting.value = e.target.checked;
    };

    return (
        <div> <Checkbox checked={value} onChange={onChange}>{title}</Checkbox> </div>
    );
};

export default SettingsModal;