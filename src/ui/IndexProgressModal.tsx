import { Modal, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged } from "rxjs";
import { indexProgress } from "../workers/UsageIndex";
import { inheritanceIndexProgress } from "../logic/Inheritance";
import { Observable } from "rxjs";

const distinctUsageIndexProgress = indexProgress.pipe(distinctUntilChanged());
const distinctInheritanceIndexProgress = inheritanceIndexProgress.pipe(distinctUntilChanged());

const ObservableProgress = ({ observable, label }: { observable: Observable<number>; label: string; }) => {
    const progress = useObservable(observable);
    const percent = progress ?? -1;

    if (percent < 0) {
        return null;
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8 }}>{label}</div>
            <Progress percent={percent} />
        </div>
    );
};

const IndexProgressModal = () => {
    const usageProgress = useObservable(distinctUsageIndexProgress) ?? -1;
    const inheritanceProgress = useObservable(distinctInheritanceIndexProgress) ?? -1;
    const isOpen = usageProgress >= 0 || inheritanceProgress >= 0;

    return (
        <Modal
            title="Indexing Minecraft Jar"
            open={isOpen}
            footer={null}
            closable={false}
            width={750}
        >
            <ObservableProgress
                observable={distinctUsageIndexProgress}
                label="Usage Index"
            />
            <ObservableProgress
                observable={distinctInheritanceIndexProgress}
                label="Inheritance Index"
            />
        </Modal>
    );
};

export default IndexProgressModal;