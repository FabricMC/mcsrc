import { notification, Progress } from "antd";
import { useObservable } from "../utils/UseObservable";
import { distinctUntilChanged, map } from "rxjs";
import { indexProgress } from "../workers/JarIndex";
import { useEffect } from "react";

const distinctJarIndexProgress = indexProgress.pipe(
    map(Math.round),
    distinctUntilChanged()
);

const IndexProgress = () => {
    const progress = useObservable(distinctJarIndexProgress) ?? -1;
    const percent = progress === -1 ? 100 : progress;
    return <Progress percent={percent} />;
};

const IndexProgressNotification = () => {
    const [notificationApi, contextHolder] = notification.useNotification();

    useEffect(() => {
        const sub = distinctJarIndexProgress.subscribe(progress => {
            if (progress === 0) {
                notificationApi.open({
                    key: "indexProgress",
                    placement: "bottomRight",
                    closable: false,
                    duration: 0,
                    message: "Indexing Minecraft Jar...",
                    description: <IndexProgress />
                });
            } else if (progress === -1) {
                notificationApi.destroy("indexProgress");
            }
        });

        return () => {
            sub.unsubscribe();
        };
    }, [notificationApi]);

    return contextHolder;
};

export default IndexProgressNotification;
