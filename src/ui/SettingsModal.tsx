import { Button, Modal, type CheckboxProps } from "antd";
import { useState } from "react";
import { SettingOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { useObservable } from "../utils/UseObservable";
import { BooleanSetting, enableTabs, removeImports } from "../logic/Settings";

const SettingsModal = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);

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
                <Setting setting={removeImports} title={"Hide imports"} />
                <Setting setting={enableTabs} title={"Enable Tabs"} />
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