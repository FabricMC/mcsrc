import { Button, Checkbox, Modal } from "antd";
import { useState } from "react";
import { agreedEula } from "../logic/Settings";
import { InfoCircleOutlined } from '@ant-design/icons';
import { useObservable } from "../utils/UseObservable";

const AboutModal = () => {
    const [isModalOpen, setIsModalOpen] = useState(!agreedEula.value);
    const accepted = useObservable(agreedEula.observable);

    const showModal = () => {
        setIsModalOpen(true);
    };

    const handleCancel = () => {
        if (!accepted) {
            return;
        }

        setIsModalOpen(false);
    };

    return (
        <>
            <Button type="default" onClick={showModal}>
                <InfoCircleOutlined />
            </Button>
            <Modal
                title="About mcsrc.dev"
                closable={accepted}
                open={isModalOpen}
                onCancel={handleCancel}
                footer={null}
            >
                <p>NOTE! This website is not redistributing any Minecraft code or compiled bytecode. The minecraft jar is downloaded directly from Mojang's servers to your device when you use this tool. Check your browser's network requests!</p>
                <p>The <a href="https://github.com/Vineflower/vineflower">Vineflower</a> decompiler is used after being compiled to wasm as part of the <a href="https://www.npmjs.com/package/@run-slicer/vf">@run-slicer/vf</a> project.</p>

                <Eula onAccept={() => setIsModalOpen(false)} />
            </Modal>
        </>
    );
};

const Eula = ({ onAccept }: { onAccept: () => void; }) => {
    const accepted = useObservable(agreedEula.observable);

    if (accepted) {
        return <></>;
    }

    return (
        <Checkbox checked={agreedEula.value} onChange={e => {
            agreedEula.value = e.target.checked;
            if (e.target.checked) {
                onAccept();
            }
        }}>
            I agree to the Minecraft <a href="https://www.minecraft.net/en-us/eula" target="_blank" rel="noreferrer">EULA</a> before using this website.
        </Checkbox>);
};


export default AboutModal;