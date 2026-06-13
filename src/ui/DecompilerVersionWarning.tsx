import { theme, Tooltip } from "antd";
import { useObservable } from "../utils/UseObservable";
import { vineflowerVersion } from "../logic/State";
import { DEFAULT_VERSION } from "../logic/vineflower/versions";

export const DecompilerVersionWarning = () => {
    const { token } = theme.useToken();
    const version = useObservable(vineflowerVersion);
    const isNonDefaultVersion = version !== DEFAULT_VERSION;

    if (!isNonDefaultVersion) return null;

    return (
        <Tooltip title={`This permalink was created using Vineflower ${version}. New files that are opened will use the latest supported Vineflower version (${DEFAULT_VERSION}).`}>
            <div style={{
                marginLeft: "16px",
                padding: "3px 8px",
                backgroundColor: token.colorWarningBg,
                color: token.colorWarningText,
                borderRadius: "4px",
                fontSize: "11px",
                fontWeight: 500,
                border: `1px solid ${token.colorWarningBorder}`,
                whiteSpace: "nowrap",
                flexShrink: 0,
                cursor: "help"
            }}>
                Note: Using legacy decompiler (Vineflower {version})
            </div>
        </Tooltip>
    );
};
