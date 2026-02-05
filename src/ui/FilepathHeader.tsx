import { theme } from "antd";
import { selectedFile } from "../logic/State";
import { useObservable } from "../utils/UseObservable";
import { getDiffChanges, diffView, type ChangeInfo } from "../logic/Diff";
import { combineLatest, map } from "rxjs";

const changeInfoObs = combineLatest([selectedFile, getDiffChanges(), diffView]).pipe(
    map(([file, changes, isDiff]) => {
        if (!isDiff || !file) return null;
        return changes.get(file) || null;
    })
);

export const FilepathHeader = () => {
    const { token } = theme.useToken();
    const info = useObservable(selectedFile);
    const changeInfo = useObservable(changeInfoObs);

    return info && (
        <div style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            alignItems: "center",
            justifyContent: "left",
            padding: ".25rem 1rem",
            fontFamily: token.fontFamily,
        }}>
            <div style={{
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                direction: "rtl",
                color: "white"
            }}>
                {info.replace(".class", "").split("/").map((path, i, arr) => (
                    <span key={path}>
                        <span style={{ color: i < arr.length - 1 ? "gray" : "white" }}>{path}</span>
                        {i < arr.length - 1 && <span style={{ color: "gray" }}>/</span>}
                    </span>
                ))}
            </div>
            {changeInfo && (
                <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                    {changeInfo.deletions !== undefined && changeInfo.deletions > 0 && (
                        <span style={{ color: token.colorError, fontSize: '12px', fontWeight: 'bold' }}>-{changeInfo.deletions}</span>
                    )}
                    {changeInfo.additions !== undefined && changeInfo.additions > 0 && (
                        <span style={{ color: token.colorSuccess, fontSize: '12px', fontWeight: 'bold' }}>+{changeInfo.additions}</span>
                    )}
                </div>
            )}
        </div>
    );
};
