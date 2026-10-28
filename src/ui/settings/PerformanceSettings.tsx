import { Flex } from "antd";
import { autoJarIndex, preferWasmDecompiler } from "../../logic/Settings";
import { SettingSwitch } from "./SettingsControls";

const PerformanceSettings = () => (
    <Flex vertical gap="middle">
        <SettingSwitch setting={autoJarIndex} title="Index classes automatically" description="Scan the JAR for file-tree icons, hierarchy navigation, and Javadoc symbols. When off, searches and reference lookups can still build the index on demand." />
        <SettingSwitch setting={preferWasmDecompiler} title="Prefer WASM decompiler" description="Use WebAssembly instead of JavaScript when available; this may improve decompilation speed." />
    </Flex>
);

export default PerformanceSettings;
