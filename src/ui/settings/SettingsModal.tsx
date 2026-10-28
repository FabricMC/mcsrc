import { AppstoreOutlined, CodeOutlined, KeyOutlined, SettingOutlined, ThunderboltOutlined, ToolOutlined } from "@ant-design/icons";
import { Button, Flex, Menu, Modal, Tooltip, Typography, theme as antTheme } from "antd";
import { useEffect, useState } from "react";
import { BehaviorSubject } from "rxjs";
import { isThin } from "../../logic/Browser";
import { useObservable } from "../../utils/UseObservable";
import AppearanceSettings from "./AppearanceSettings";
import CodeSettings from "./CodeSettings";
import KeybindsSettings from "./KeybindsSettings";
import PerformanceSettings from "./PerformanceSettings";
import ToolsSettings from "./ToolsSettings";

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

const SettingsModal = () => {
    const isModalOpen = useObservable(settingsModalOpen);
    const isSmall = useObservable(isThin);
    const [activeSection, setActiveSection] = useState("appearance");
    const { token } = antTheme.useToken();
    const sections = [
        { key: 'appearance', label: 'Appearance', icon: <AppstoreOutlined aria-hidden="true" />, content: <AppearanceSettings /> },
        { key: 'code', label: 'Code', icon: <CodeOutlined aria-hidden="true" />, content: <CodeSettings /> },
        { key: 'performance', label: 'Performance', icon: <ThunderboltOutlined aria-hidden="true" />, content: <PerformanceSettings /> },
        {
            key: 'keybinds',
            label: 'Keybinds',
            icon: <KeyOutlined aria-hidden="true" />,
            content: <KeybindsSettings />,
        },
        { key: 'tools', label: 'Tools', icon: <ToolOutlined aria-hidden="true" />, content: <ToolsSettings onClose={() => settingsModalOpen.next(false)} /> },
    ];

    useEffect(() => {
        if (isModalOpen) {
            setActiveSection("appearance");
        }
    }, [isModalOpen]);

    return (
        <Modal
            title="Settings"
            width={isSmall ? '100%' : 740}
            style={isSmall ? { top: 0, margin: 0, maxWidth: '100%', paddingBottom: 0 } : undefined}
            destroyOnHidden
            open={isModalOpen}
            onCancel={() => settingsModalOpen.next(false)}
            footer={null}
            styles={{
                header: { display: 'none' },
                container: {
                    padding: 0,
                    overflow: 'hidden',
                    height: isSmall ? '100dvh' : 'min(560px, calc(100dvh - 140px))',
                    borderRadius: isSmall ? 0 : undefined,
                },
                body: { height: '100%' },
            }}
        >
            <Flex vertical={isSmall} style={{ height: '100%' }}>
                <Flex vertical style={{ width: isSmall ? '100%' : 192, flexShrink: 0, background: token.colorFillAlter }}>
                    <Typography.Title level={5} style={{ margin: 0, padding: '20px 24px' }}>
                        Settings
                    </Typography.Title>
                    <div style={{ overflowX: 'auto' }}>
                        <Menu
                            aria-label="Settings categories"
                            mode={isSmall ? 'horizontal' : 'inline'}
                            disabledOverflow={isSmall}
                            selectedKeys={[activeSection]}
                            onClick={({ key }) => setActiveSection(key)}
                            items={sections.map(({ key, label, icon }) => ({ key, label, icon: isSmall ? undefined : icon }))}
                            style={{
                                background: 'transparent',
                                borderInlineEnd: 0,
                                width: isSmall ? 'max-content' : undefined,
                                minWidth: '100%',
                            }}
                        />
                    </div>
                </Flex>
                <div
                    key={activeSection}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        minHeight: 0,
                        overflowY: 'auto',
                        padding: isSmall ? 24 : '56px 24px 24px',
                    }}
                >
                    {sections.find(section => section.key === activeSection)?.content}
                </div>
            </Flex>
        </Modal>
    );
};

export default SettingsModal;
