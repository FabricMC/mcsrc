import { theme } from "antd";
import { selectedFile } from "../logic/State";
import { useObservable } from "../utils/UseObservable";

export const FilepathHeader = () => {
    const { token } = theme.useToken();
    const info = useObservable(selectedFile);

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
        </div>
    );
};