import { UndoOutlined } from "@ant-design/icons";
import { Button, Flex, Space, Tooltip, Typography } from "antd";
import { useEffect, type FC } from "react";
import { capturingKeybind, rawKeydownEvent } from "../../logic/Keybinds";
import { focusSearch, showStructure, type KeybindSetting, type KeybindValue } from "../../logic/Settings";
import { useObservable } from "../../utils/UseObservable";

const KeybindsSettings = () => (
    <Flex vertical gap="large">
        <KeybindOption setting={focusSearch} title="Focus search" description="Move the cursor to the sidebar search box to find a class, method, or field." captureId="focus_search" />
        <KeybindOption setting={showStructure} title="Show structure" description="Open an outline of the current class to jump to its fields and methods." captureId="show_structure" />
    </Flex>
);

interface KeybindOptionProps {
    setting: KeybindSetting;
    title: string;
    description: string;
    captureId: string;
}

const KeybindOption: FC<KeybindOptionProps> = ({ setting, title, description, captureId }) => {
    const value = useObservable(setting.observable);
    const capturing = useObservable(capturingKeybind);
    const isCapturing = capturing === captureId;

    useEffect(() => {
        if (!isCapturing) {
            return;
        }

        const subscription = rawKeydownEvent.subscribe((event) => {
            event.preventDefault();

            if (event.key === 'Escape') {
                capturingKeybind.next(null);
                return;
            }

            const modifierKeys = ['Control', 'Alt', 'Shift', 'Meta'];
            if (!modifierKeys.includes(event.key)) {
                setting.setFromEvent(event);
                capturingKeybind.next(null);
            }
        });

        return () => {
            subscription.unsubscribe();

            if (capturingKeybind.value === captureId) {
                capturingKeybind.next(null);
            }
        };
    }, [isCapturing, captureId, setting]);

    const startCapture = () => {
        if (capturingKeybind.value === null) {
            capturingKeybind.next(captureId);
        }
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
        <Flex align="center" justify="space-between" gap="middle">
            <Flex vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
                <span>{title}</span>
                <Typography.Text type="secondary" id={`${captureId}-description`}>{description}</Typography.Text>
            </Flex>
            <Space.Compact style={{ flexShrink: 0 }}>
                <Button
                    aria-label={`Change ${title.toLowerCase()} shortcut`}
                    aria-describedby={`${captureId}-description`}
                    onClick={startCapture}
                    type={isCapturing ? 'primary' : 'default'}
                >
                    {isCapturing ? 'Press keys...' : formatKeybind(value)}
                </Button>
                <Tooltip title="Reset to default">
                    <Button
                        icon={<UndoOutlined aria-hidden="true" />}
                        onClick={() => setting.reset()}
                        aria-label={`Reset ${title.toLowerCase()} shortcut`}
                    />
                </Tooltip>
            </Space.Compact>
        </Flex>
    );
};

export default KeybindsSettings;
