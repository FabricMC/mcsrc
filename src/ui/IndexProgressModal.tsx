import { Modal, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged } from "rxjs";
import { indexProgress } from "../workers/UsageIndex";

const distinctProgress = indexProgress.pipe(distinctUntilChanged());

const IndexProgressModal = () => {
    const progress = useObservable(distinctProgress);
    const percent = progress ?? -1;

    return (
        <Modal
            title="Indexing Minecraft Jar"
            open={percent >= 0}
            footer={null}
            closable={false}
            width={750}
        >
            <Progress percent={percent} />
        </Modal>
    );
};

export default IndexProgressModal;