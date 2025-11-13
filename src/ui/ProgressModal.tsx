import { Modal, Progress } from "antd";
import { downloadProgress } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";

const ProcesModal = () => {
    const progress = useObservable(downloadProgress);

    return (
        <Modal
            title="Downloading Minecraft Jar"
            open={progress !== undefined}
            footer={null}
            closable={false}
        >
            <Progress percent={progress ?? 0} />
        </Modal>
    );
};

export default ProcesModal;