import { Modal, Button, Divider, message } from "antd";
import { GithubOutlined } from "@ant-design/icons";
import { IS_JAVADOC_EDITOR } from "../../site";
import { useObservable } from "../../utils/UseObservable";
import { javadocApi } from "./JavadocApi";
import { useState } from "react";
import { agreedEula } from "../../logic/Settings";

const LoginModal = () => {
    if (!IS_JAVADOC_EDITOR) {
        return (<></>);
    }

    const needsToLogin = useObservable(javadocApi.needsToLogin);
    const accepted = useObservable(agreedEula.observable);
    const [loading, setLoading] = useState(false);
    const [messageApi, contextHolder] = message.useMessage();

    const handleGithubLogin = async () => {
        try {
            setLoading(true);
            const loginUrl = await javadocApi.getGithubLoginUrl();
            window.location.href = loginUrl;
        } catch (error) {
            console.error("Failed to get GitHub login URL:", error);
            messageApi.error("Failed to initiate GitHub login. Please try again.");
            setLoading(false);
        }
    };

    return (
        <Modal
            title="Login Required"
            open={needsToLogin && accepted}
            footer={null}
            closable={false}
            mask={{ closable: false }}
        >
            <p style={{ marginBottom: 24 }}>
                Please log in to access the Javadoc editor.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Button
                    type="primary"
                    icon={<GithubOutlined />}
                    size="large"
                    block
                    loading={loading}
                    onClick={handleGithubLogin}
                >
                    Login with GitHub
                </Button>
            </div>
        </Modal>
    );
};

export default LoginModal;