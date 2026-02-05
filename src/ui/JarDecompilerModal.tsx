import { Alert, Button, Form, message, Modal, Popconfirm, Space, type ModalProps } from "antd";
import { JavaOutlined } from '@ant-design/icons';
import { BehaviorSubject } from "rxjs";
import { useObservable } from "../utils/UseObservable";
import { NumberOption } from "./SettingsModal";
import { NumberSetting } from "../logic/Settings";
import { decompileEntireJar, deleteCache, type DecompileEntireJarTask } from "../workers/decompile/client";
import { minecraftJar } from "../logic/MinecraftApi";

const modalOpen = new BehaviorSubject(false);

export const JarDecompilerModalButton = () => (
    <Button color="danger" variant="outlined" onClick={() => modalOpen.next(true)}>
        <JavaOutlined />
    </Button>
);

const maxThread = navigator.hardwareConcurrency || 4;
const threadsSetting = new NumberSetting("jarDecompilerThreads", Math.max(maxThread / 2, 1));
const splitsSetting = new NumberSetting("jarDecompilerSplits", 100);

export const JarDecompilerModal = () => {
    const jar = useObservable(minecraftJar);
    const isModalOpen = useObservable(modalOpen);

    const [messageApi, contextHolder] = message.useMessage();

    const onOk = () => {
        modalOpen.next(false);
        if (!jar) return;

        const task = decompileEntireJar(jar.jar, {
            threads: threadsSetting.value,
            splits: splitsSetting.value,
            logger(className) {
                progressSubject.next(className);
            },
        });

        taskSubject.next(task);
        task.start().finally(() => {
            taskSubject.next(undefined);
            progressSubject.next(undefined);
        });
        progressSubject.next("Decompiling...")
    }

    const clearCache = (all: boolean) => {
        if (!jar) return;

        deleteCache(all ? null : jar.jar.name)
            .finally(() => messageApi.open({ type: "success", content: "Cache deleted" }));
    }


    return (
        <Modal
            title="Decompile Entire JAR"
            open={isModalOpen}
            onCancel={() => modalOpen.next(false)}
            onOk={onOk}
        >
            {contextHolder}
            <Alert
                type="warning"
                message="Decompiling the entire JAR will use large amount of resources and may crash the browser."
                description="If the browser crashed, simply reopen the page and you can continue decompiling the rest of the classes by opening this menu again."
            />
            <br />
            <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 8 }}>
                <NumberOption setting={threadsSetting} title="Worker Threads" min={1} max={maxThread} />
                <NumberOption setting={splitsSetting} title="Worker Splits" min={1} />
                <Form.Item label="Cache">
                    <Space>
                        <Popconfirm title="Are you sure?" onConfirm={() => clearCache(false)}>
                            <Button color="danger" variant="outlined">Clear Current</Button>
                        </Popconfirm>
                        <Popconfirm title="Are you sure?" onConfirm={() => clearCache(true)}>
                            <Button color="danger" variant="outlined">Clear ALL</Button>
                        </Popconfirm>
                    </Space>
                </Form.Item>
            </Form>

        </Modal>
    );
};

const progressSubject = new BehaviorSubject<string | undefined>(undefined);
const taskSubject = new BehaviorSubject<DecompileEntireJarTask | undefined>(undefined);

export const JarDecompilerProgressModal = () => {
    const progress = useObservable(progressSubject);
    const task = useObservable(taskSubject);

    return (
        <Modal
            title="Decompiling JAR..."
            open={progress ? true : false}
            closable={false}
            keyboard={false}
            maskClosable={false}
            onOk={() => {
                if (task) task.stop();
                taskSubject.next(undefined);
            }}
            okText={task ? "Stop" : "Stopping..."}
            footer={(_, { OkBtn }) => (
                <OkBtn />
            )}
        >
            <div style={{
                fontFamily: "monospace",
                padding: "10px 0",
                overflow: "hidden",
                textOverflow: "ellipsis",
                wordBreak: "break-all",
                whiteSpace: "nowrap",
                width: "100%"
            }}>
                {progress}
            </div>
        </Modal>
    );
}

const deleteModalOpen = new BehaviorSubject(false);
