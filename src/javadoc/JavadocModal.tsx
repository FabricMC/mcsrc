import { Modal, Button, message } from "antd";
import { activeJavadocToken, getJavadocForToken, javadocData, setTokenJavadoc } from "./Javadoc";
import { useObservable } from "../utils/UseObservable";
import type { Token } from "../logic/Tokens";
import JavadocMarkdownEditor from "./JavadocMarkdownEditor";
import { useEffect, useMemo, useState } from "react";
import { writeJavadoc } from "./JavadocStorage";

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
                <JavadocMarkdownEditor key={getTokenKey(token)} value={initialValue} onChange={onValueChange} />
            </div>
        </div>
    );
};

function getTokenKey(token: Token): string {
    if (token.type === "method" || token.type === "field") {
        return `${token.type}:${token.className}:${token.name}:${token.descriptor}`;
    }

    return `${token.type}:${token.className}`;
}

const JavadocModal = () => {
    const token = useObservable(activeJavadocToken);
    const [currentValue, setCurrentValue] = useState<string | undefined>();
    const [loading, setLoading] = useState(false);

    const [messageApi, contextHolder] = message.useMessage();

    useEffect(() => {
        setCurrentValue(undefined);
    }, [token]);

    const handleSave = async () => {
        if (!token) {
            messageApi.error("No token selected.");
            return;
        }

        setLoading(true);
        try {
            const documentation = currentValue ?? getJavadocForToken(token, javadocData.value) ?? "";
            await writeJavadoc(token, documentation);
            setTokenJavadoc(token, documentation);
            messageApi.success("Javadoc saved successfully.");
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
        <>
            {contextHolder}
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
        </>
    );
};

export default JavadocModal;
