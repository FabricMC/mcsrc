import { theme } from "antd";
import { useObservable } from "../utils/UseObservable";
import { getDiffChanges } from "../logic/Diff";
import { combineLatest, map, of, switchMap } from "rxjs";
import { selectedFile, diffView } from "../logic/State";
import { DecompilerVersionWarning } from "./DecompilerVersionWarning";
import { withoutClassExtension } from "../utils/Names";

const changeInfoObs = diffView.pipe(
    switchMap(isDiff => {
        if (!isDiff) return of(null);

        return combineLatest([selectedFile, getDiffChanges()]).pipe(map(([file, changes]) => {
            if (!file) return null;

            return changes.get(file) || null;
        }));
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
            justifyContent: "space-between",
            padding: ".25rem 1rem",
            fontFamily: token.fontFamily,
        }}>
            <div style={{
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
                minWidth: 0,
            }}>
                <div style={{
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    direction: "rtl",
                    color: token.colorText
                }}>
                    {withoutClassExtension(info).split("/").map((path, i, arr) => (
                        <span key={path}>
                            <span style={{ color: i < arr.length - 1 ? token.colorTextTertiary : token.colorText }}>{path}</span>
                            {i < arr.length - 1 && <span style={{ color: token.colorTextTertiary }}>/</span>}
                        </span>
                    ))}
                </div>
                {changeInfo && (
                    <div style={{ display: "flex", gap: "4px", marginLeft: "8px", flexShrink: 0 }}>
                        {changeInfo.deletions !== undefined && changeInfo.deletions > 0 && (
                            <span style={{ color: token.colorError, fontSize: '12px', fontWeight: 'bold' }}>-{changeInfo.deletions}</span>
                        )}
                        {changeInfo.additions !== undefined && changeInfo.additions > 0 && (
                            <span style={{ color: token.colorSuccess, fontSize: '12px', fontWeight: 'bold' }}>+{changeInfo.additions}</span>
                        )}
                    </div>
                )}
            </div>
            <DecompilerVersionWarning />
        </div>
    );
};
