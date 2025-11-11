import { useObservable } from "../utils/UseObservable"
import { isThin } from "../logic/Browser"
import { selectedFile } from "../logic/State"
import { theme } from "antd";

export const CodeHeader = () => {
    const { token } = theme.useToken();
    const isMobile = useObservable(isThin);
    const info = useObservable(selectedFile);

    return info ? (
        <div style={{
            display: "flex",
            width: "100%",
            boxSizing: "border-box",
            alignItems: "center",
            justifyContent: "left",
            padding: `.5rem 1rem .5rem ${isMobile ? "67px" : "1rem"}`, /* temp mobile padding because of FloatButton*/
            fontFamily: token.fontFamily
        }}>
            <div style={{
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                overflow: "hidden",
                direction: "rtl",
                color: "white"
            }}>
                {info.replace(".class", "").split("/").map((path, i, arr) => (
                    <>
                        <span style={{ color: i < arr.length - 1 ? "gray" : "white" }}>{path}</span>
                        {i < arr.length - 1 && <span style={{ color: "gray" }}>/</span>}
                    </>
                ))}
            </div>
        </div>
    ) : null
}