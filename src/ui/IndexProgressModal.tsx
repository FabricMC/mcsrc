import { Modal, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged, map } from "rxjs";
import { indexProgress } from "../workers/JarIndex";

const distinctJarIndexProgress = indexProgress.pipe(
    map(Math.round),
    distinctUntilChanged()
);

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