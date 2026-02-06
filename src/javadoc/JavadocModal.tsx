import { Modal, Button, message } from "antd";
import { activeJavadocToken, getJavadocForToken, javadocData, setTokenJavadoc } from "./Javadoc";
import { useObservable } from "../utils/UseObservable";
import { IS_JAVADOC_EDITOR } from "../site";
import type { Token } from "../logic/Tokens";
import JavadocMarkdownEditor from "./JavadocMarkdownEditor";
import { useMemo, useState } from "react";
import { javadocApi, type UpdateTarget } from "./api/JavadocApi";
import { selectedMinecraftVersion } from "../logic/State";

const ModalBody = ({ token, onValueChange }: { token: Token; onValueChange: (value: string | undefined) => void; }) => {
    const initialValue = useMemo(() => getJavadocForToken(token, javadocData.value) || "", [token]);

    return (
        <div style={{ width: "100%", boxSizing: "border-box" }}>
            <div style={{
                padding: "10px",
                background: "#1e1e1e",
                color: "#d4d4d4",
                fontFamily: "monospace",
                fontSize: "12px",
                borderBottom: "1px solid #333"
            }}>
                <div><strong>Type:</strong> {token.type}</div>
                <div><strong>Class:</strong> {token.className}</div>
                {token.type === 'field' || token.type === 'method' ? (
                    <>
                        <div><strong>Name:</strong> {token.name}</div>
                        <div><strong>Descriptor:</strong> {token.descriptor}</div>
                    </>
                ) : null}
            </div>
            <div style={{ height: "440px", width: "100%", boxSizing: "border-box" }}>
                <JavadocMarkdownEditor value={initialValue} onChange={onValueChange} />
            </div>
        </div>
    );
};

const JavadocModal = () => {
    if (!IS_JAVADOC_EDITOR) {
        return (<></>);
    }

    const token = useObservable(activeJavadocToken);
    const minecraftVersion = useObservable(selectedMinecraftVersion);
    const [currentValue, setCurrentValue] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);

    const [messageApi, contextHolder] = message.useMessage();

    const handleSave = async () => {
        if (!token) {
            messageApi.error("No token selected.");
            return;
        }

        if (!minecraftVersion) {
            messageApi.error("No Minecraft version selected.");
            return;
        }

        var target: UpdateTarget | null = null;
        if (token.type == 'method' || token.type == 'field') {
            target = {
                type: token.type,
                name: token.name,
                descriptor: token.descriptor
            };
        }

        setLoading(true);
        try {
            await javadocApi.updateJavadoc(minecraftVersion, {
                className: token.className,
                target,
                documentation: currentValue || ""
            });

            messageApi.success("Javadoc saved successfully.");

            // Update the local in-memory Javadoc data
            setTokenJavadoc(token, currentValue);

            activeJavadocToken.next(null);
        } catch (error) {
            messageApi.error("Failed to save javadoc.");
            console.error("Error saving javadoc:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        activeJavadocToken.next(null);
    };

    return (
        <Modal
            title="Javadoc"
            open={token !== null}
            onCancel={handleCancel}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px' }}>
                    <Button onClick={handleCancel} disabled={loading}>Cancel</Button>
                    <Button type="primary" onClick={handleSave} loading={loading}>Save</Button>
                </div>
            }
            width={750}
        >
            {token && <ModalBody token={token} onValueChange={setCurrentValue} />}
        </Modal>
    );
};

export default JavadocModal;