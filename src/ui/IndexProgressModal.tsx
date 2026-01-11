import { Modal, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged } from "rxjs";
import { indexProgress } from "../workers/JarIndex";

const distinctJarIndexProgress = indexProgress.pipe(distinctUntilChanged());

const IndexProgressModal = () => {
    const progress = useObservable(distinctJarIndexProgress) ?? -1;
    const isOpen = progress >= 0;

    return (
        <Modal
            title="Indexing Minecraft Jar"
            open={isOpen}
            footer={null}
            closable={false}
            width={750}
        >
            <Progress percent={progress} />
        </Modal>
    );
};

export default IndexProgressModal;