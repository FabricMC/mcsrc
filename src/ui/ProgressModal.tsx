import { Modal, Progress } from "antd";
import { animationFrameScheduler, auditTime } from "rxjs";
import { minecraftLoadProgress, queuedMinecraftVersions } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";

const progressTitles = {
    downloading: "Downloading Minecraft Jar",
    remapping: "Remapping Minecraft Jar",
    opening: "Opening Minecraft Jar",
};

const displayedMinecraftLoadProgress = minecraftLoadProgress.pipe(
    auditTime(0, animationFrameScheduler)
);

const ProgressModal = () => {
    const progress = useObservable(displayedMinecraftLoadProgress);
    const queuedVersions = useObservable(queuedMinecraftVersions) ?? [];
    const stage = progress?.stage ?? "downloading";

    return (
        <Modal
            title={progressTitles[stage]}
            open={progress !== undefined}
            footer={null}
            closable={false}
        >
            <p>Minecraft {progress?.version}</p>
            <Progress
                percent={progress?.percent ?? 0}
                format={value => `${Math.round(value ?? 0)}%`}
                styles={{ track: { transition: "none" } }}
            />
            {queuedVersions.length > 0 && <p>Queued: {queuedVersions.join(", ")}</p>}
        </Modal>
    );
};

export default ProgressModal;
