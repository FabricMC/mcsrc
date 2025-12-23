import { Button, Modal, type CheckboxProps, Form, Tooltip } from "antd";
import { useState } from "react";
import { SettingOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { useObservable } from "../utils/UseObservable";
import { BooleanSetting, enableTabs, displayLambdas, focusSearch, KeybindSetting, type Key, type KeybindValue } from "../logic/Settings";
import { capturingKeybind, rawKeydownEvent } from "../logic/Keybinds";

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
                <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }}>
                    <BooleanToggle setting={enableTabs} title={"Enable Tabs"} />
                    <BooleanToggle setting={displayLambdas} title={"Lambda Names"} tooltip="Display lambda names as inline comments. Does not support permalinking." />
                    <KeybindControl setting={focusSearch} title={"Focus Search"} />
                </Form>
            </Modal>
        </>
    );
};

interface BooleanToggleProps {
    setting: BooleanSetting;
    title: string;
    tooltip?: string;
}

const BooleanToggle: React.FC<BooleanToggleProps> = ({ setting, title, tooltip }) => {
    const value = useObservable(setting.observable);
    const onChange: CheckboxProps['onChange'] = (e) => {
        setting.value = e.target.checked;
    };

    const checkbox = <Checkbox checked={value} onChange={onChange} />;

    return (
        <Form.Item label={title}>
            {tooltip ? <Tooltip title={tooltip}>{checkbox}</Tooltip> : checkbox}
        </Form.Item>
    );
};

interface KeybindProps {
    setting: KeybindSetting;
    title: string;
}

const KeybindControl: React.FC<KeybindProps> = ({ setting, title }) => {
    const value = useObservable(setting.observable);
    const capturing = useObservable(capturingKeybind);

    const startCapture = () => {
        capturingKeybind.next(true);
        const subscription = rawKeydownEvent.subscribe((event) => {
            event.preventDefault();

            // Only capture if a non-modifier key is pressed
            const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
            if (!modifierKeys.includes(event.key)) {
                setting.setFromEvent(event);
                capturingKeybind.next(false);
                subscription.unsubscribe();
            }
        });
    };

    const formatKeybind = (keybind: KeybindValue | undefined): string => {
        if (!keybind) return 'Not set';
        return keybind.split('+').map(k => {
            if (k == ' ') return '<space>';
            const key = k.trim();
            return key.charAt(0).toUpperCase() + key.slice(1);
        }).join('+');
    };

    return (
        <Form.Item label={title}>
            <Button
                onClick={startCapture}
                type={capturing ? 'primary' : 'default'}
            >
                {capturing ? 'Press keys...' : formatKeybind(value)}
            </Button>
            <Button
                onClick={() => setting.reset()}
                style={{ marginLeft: '8px' }}
            >
                Reset
            </Button>
        </Form.Item>
    );
};

export default SettingsModal;