import { notification } from "antd";
import { useEffect } from "react";
import { annotaterServerOffline } from "../javadoc/JavadocServer";

const AnnotaterServerNotification = () => {
    const [notificationApi, contextHolder] = notification.useNotification();

    useEffect(() => {
        const subscription = annotaterServerOffline.subscribe(details => {
            if (details === null) {
                notificationApi.destroy("annotaterServer");
            } else {
                notificationApi.open({
                    key: "annotaterServer",
                    placement: "bottomRight",
                    closable: false,
                    duration: 0,
                    message: "Annotater server offline",
                    description: `The annotater server is unreachable: ${details}. Javadoc changes cannot be saved until it responds again.`,
                });
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [notificationApi]);

    return contextHolder;
};

export default AnnotaterServerNotification;
