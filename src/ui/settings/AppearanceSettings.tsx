import { DesktopOutlined, MoonOutlined, SunOutlined } from "@ant-design/icons";
import { Flex, Segmented } from "antd";
import { compactPackages, enableTabs, tabPersistance, theme, type ThemeMode } from "../../logic/Settings";
import { useObservable } from "../../utils/UseObservable";
import { SettingSwitch } from "./SettingsControls";

const AppearanceSettings = () => {
    const tabsEnabled = useObservable(enableTabs.observable);

    return (
        <Flex vertical gap="large">
            <ThemeOption />
            <Flex vertical gap="middle">
                <SettingSwitch setting={enableTabs} title="Open files in tabs" description="Keep each class you open in its own tab so you can switch between files." />
                <SettingSwitch setting={tabPersistance} title="Restore open tabs" description="Reopen the same files and return to your active tab when you reload the page." disabled={!tabsEnabled} />
                <SettingSwitch setting={compactPackages} title="Compact packages" description="Show single-child package chains on one row, such as net/minecraft/client." />
            </Flex>
        </Flex>
    );
};

const ThemeOption = () => {
    const value = useObservable(theme.observable);

    return (
        <Flex vertical gap="small">
            <span id="settings-theme-label">Theme</span>
            <Segmented<ThemeMode>
                aria-labelledby="settings-theme-label"
                block
                value={value}
                onChange={value => theme.value = value}
                options={[
                    { value: 'light', label: 'Light', icon: <SunOutlined aria-hidden="true" /> },
                    { value: 'system', label: 'System', icon: <DesktopOutlined aria-hidden="true" /> },
                    { value: 'dark', label: 'Dark', icon: <MoonOutlined aria-hidden="true" /> },
                ]}
            />
        </Flex>
    );
};

export default AppearanceSettings;
