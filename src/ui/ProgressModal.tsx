import { Button, Modal, Progress } from "antd";
import { cancelDownload, downloadProgress, remapProgress } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";

const ProgressModal = () => {
    const download = useObservable(downloadProgress);
    const remap = useObservable(remapProgress);
    const isRemapping = remap !== undefined;
    const progress = isRemapping ? remap : download;

    return (
        <Modal
            title={isRemapping ? "Remapping Minecraft Jar" : "Downloading Minecraft Jar"}
            open={progress !== undefined}
            footer={null}
            closable={false}
        >
            <Progress percent={progress ?? 0} />
            {!isRemapping && (
                <Button onClick={cancelDownload}>
                    Cancel
                </Button>
            )}
        </Modal>
    );
};

export default ProgressModal;
