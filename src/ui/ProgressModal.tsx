import { Modal, Progress } from "antd";
import { downloadProgress, remapProgress } from "../logic/MinecraftApi";
import { useObservable } from "../utils/UseObservable";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { ProgressInfo } from "../utils/Progress";

const ProgressModal = () => {
    const download = useObservable(downloadProgress);
    const remap = useObservable(remapProgress);
    const isRemapping = remap !== undefined;
    const progress = isRemapping ? remap : download;

    const lastProgressInfo: RefObject<ProgressInfo | undefined> = useRef({ percent: 0, retryCount: 0 } as ProgressInfo);
    const lastRetryTimestamp: RefObject<number> = useRef(0);

    const [progressValue, setProgressValue] = useState(0);
    const [retryInfo, setRetryInfo] = useState("");

    useEffect(() => {
        if (progress && progress.retryCount > 0) {
            setRetryInfo(` (Retry ${progress.retryCount})`);
        } else {
            setRetryInfo("");
        }

        if (progress && lastProgressInfo.current) {
            if (progress.retryCount > lastProgressInfo.current.retryCount) {
                // fail & retry triggered
                lastRetryTimestamp.current = Date.now();
            }
        }
        lastProgressInfo.current = progress;

        if (progress) {
            setProgressValue(progress.percent);
        }
    }, [progress]);

    return (
        <Modal
            title={(isRemapping ? "Remapping Minecraft Jar" : "Downloading Minecraft Jar") + retryInfo}
            open={progress !== undefined}
            footer={null}
            closable={false}
        >
            <Progress percent={progressValue} status={Date.now() - lastRetryTimestamp.current < 1000 ? "exception" : "normal"} />
        </Modal>
    );
};

export default ProgressModal;
