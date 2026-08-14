import { Button, Flex, Modal, type CheckboxProps, Form, Tooltip, InputNumber, type InputNumberProps, Space, Tabs } from "antd";
import { SettingOutlined, SunOutlined, MoonOutlined, DesktopOutlined, JavaOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { useObservable } from "../utils/UseObservable";
import { BooleanSetting, enableTabs, displayLambdas, focusSearch, KeybindSetting, type KeybindValue, bytecode, showStructure, NumberSetting, preferWasmDecompiler, compactPackages, theme, autoJarIndex } from "../logic/Settings";
import { capturingKeybind, rawKeydownEvent } from "../logic/Keybinds";
import { BehaviorSubject } from "rxjs";
import React, { useEffect, useState } from "react";
import { modalOpen } from "./JarDecompilerModal";

export const settingsModalOpen = new BehaviorSubject<boolean>(false);

export const SettingsModalButton = () => {
    return (
        <Tooltip title="Settings">
            <Button
                aria-label="Settings"
                icon={<SettingOutlined />}
                type="default"
                onClick={() => settingsModalOpen.next(true)}
            />
        </Tooltip>
    );
};

const SettingsTab = () => {
    const displayLambdasValue = useObservable(displayLambdas.observable);
    const bytecodeValue = useObservable(bytecode.observable);

    return (
        <div className="settings-tab-content">
            <Form className="settings-form" layout="horizontal" labelCol={{ span: 9 }} wrapperCol={{ span: 16 }}>
                <ThemeOption />
                <BooleanOption setting={enableTabs} title="Enable Tabs" />
                <BooleanOption setting={compactPackages} title="Compact Packages" tooltip="Collapse packages with one child into one." />
                <BooleanOption setting={autoJarIndex} title="Auto Jar Index" tooltip="Automatically index class metadata for file icons." />
                <BooleanOption setting={displayLambdas} title="Lambda Names" tooltip="Display lambda names as inline comments. Does not support permalinking." disabled={bytecodeValue} />
                <BooleanOption setting={bytecode} title="Show Bytecode" tooltip="Show bytecode instructions alongside decompiled source. Does not support permalinking." disabled={displayLambdasValue} />
                <BooleanOption setting={preferWasmDecompiler} title="Prefer WASM Decompiler" tooltip="WASM decompiler might be faster than JavaScript." />
                <KeybindOption setting={focusSearch} title="Focus Search" captureId="focus_search" />
                <KeybindOption setting={showStructure} title="Show Structure" captureId="show_structure" />
            </Form>
        </div>
    );
};

const AdvancedTab = () => (
    <Flex className="settings-tab-content" vertical align="flex-start" gap="small">
        <Button
            data-testid="jar-decompiler"
            icon={<JavaOutlined />}
            onClick={() => {
                settingsModalOpen.next(false);
                modalOpen.next(true);
            }}
        >
            Decompile All
        </Button>
    </Flex>
);

const SettingsModal = () => {
    const isModalOpen = useObservable(settingsModalOpen);
    const [activeTab, setActiveTab] = useState("settings");

    useEffect(() => {
        if (isModalOpen) setActiveTab("settings");
    }, [isModalOpen]);

    return (
        <Modal
            title="Settings"
            open={isModalOpen}
            onCancel={() => settingsModalOpen.next(false)}
            footer={null}
        >
            <Tabs
                className="settings-tabs"
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: "settings",
                        label: "Settings",
                        children: <SettingsTab />,
                    },
                    {
                        key: "advanced",
                        label: "Advanced",
                        children: <AdvancedTab />,
                    },
                ]}
            />
        </Modal>
    );
};

export interface BooleanOptionProps {
    setting: BooleanSetting;
    title: string;
    tooltip?: string;
    disabled?: boolean;
}

export const BooleanOption: React.FC<BooleanOptionProps> = ({ setting, title, tooltip, disabled }) => {
    const value = useObservable(setting.observable);
    const onChange: CheckboxProps['onChange'] = (e) => {
        setting.value = e.target.checked;
    };

    const checkbox = <Checkbox checked={value} onChange={onChange} disabled={disabled} />;

    return (
        <Form.Item label={title}>
            {tooltip ? <Tooltip title={tooltip}>{checkbox}</Tooltip> : checkbox}
        </Form.Item>
    );
};

export const ThemeOption: React.FC = () => {
    const value = useObservable(theme.observable);

    return (
        <Form.Item label="Theme">
            <Space.Compact>
                <Tooltip title="Light">
                    <Button
                        icon={<SunOutlined />}
                        type={value === 'light' ? 'primary' : 'default'}
                        onClick={() => theme.value = 'light'}
                    />
                </Tooltip>
                <Tooltip title="System">
                    <Button
                        icon={<DesktopOutlined />}
                        type={value === 'system' ? 'primary' : 'default'}
                        onClick={() => theme.value = 'system'}
                    />
                </Tooltip>
                <Tooltip title="Dark">
                    <Button
                        icon={<MoonOutlined />}
                        type={value === 'dark' ? 'primary' : 'default'}
                        onClick={() => theme.value = 'dark'}
                    />
                </Tooltip>
            </Space.Compact>
        </Form.Item>
    );
};

export interface NumberOptionProps {
    setting: NumberSetting;
    title: string;
    min?: number;
    max?: number;
    testid?: string;
}

export const NumberOption: React.FC<NumberOptionProps> = ({ setting, title, min, max, testid}) => {
    const value = useObservable(setting.observable);
    const onChange: InputNumberProps<number>["onChange"] = (e) => {
        setting.value = e ?? setting.defaultValue;
    }

    return (
        <Form.Item label={title}>
            <InputNumber data-testid={testid} min={min} max={max} value={value} onChange={onChange}/>
        </Form.Item>
    );
}

interface KeybindOptionProps {
    setting: KeybindSetting;
    title: string;
    captureId: string;
}

const KeybindOption: React.FC<KeybindOptionProps> = ({ setting, title, captureId }) => {
    const value = useObservable(setting.observable);
    const capturing = useObservable(capturingKeybind);
    const isCapturing = capturing === captureId;

    const startCapture = () => {
        if (capturingKeybind.value !== null) {
            return;
        }
        capturingKeybind.next(captureId);
        const subscription = rawKeydownEvent.subscribe((event) => {
            event.preventDefault();

            // Only capture if a non-modifier key is pressed
            const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
            if (!modifierKeys.includes(event.key)) {
                setting.setFromEvent(event);
                capturingKeybind.next(null);
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
                type={isCapturing ? 'primary' : 'default'}
            >
                {isCapturing ? 'Press keys...' : formatKeybind(value)}
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
