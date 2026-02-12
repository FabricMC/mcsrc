import { Alert, Button, Form, message, Modal, Popconfirm, Space } from "antd";
import { JavaOutlined } from '@ant-design/icons';
import { BehaviorSubject } from "rxjs";
import { useObservable } from "../utils/UseObservable";
import { BooleanOption, NumberOption } from "./SettingsModal";
import { decompilerSplits, decompilerThreads, MAX_THREADS, preferWasmDecompiler } from "../logic/Settings";
import { decompileEntireJar, deleteCache, type DecompileEntireJarTask } from "../workers/decompile/client";
import { minecraftJar } from "../logic/MinecraftApi";

const modalOpen = new BehaviorSubject(false);

export const JarDecompilerModalButton = () => (
    <Button data-testid="jar-decompiler" color="danger" variant="outlined" onClick={() => modalOpen.next(true)}>
        <JavaOutlined />
    </Button>
);

export const JarDecompilerModal = () => {
    const jar = useObservable(minecraftJar);
    const isModalOpen = useObservable(modalOpen);

    const [messageApi, messageCtx] = message.useMessage();
    const [modalApi, modalCtx] = Modal.useModal();

    const onOk = () => {
        modalOpen.next(false);
        if (!jar) return;

        const task = decompileEntireJar(jar.jar, {
            threads: decompilerThreads.value,
            splits: decompilerSplits.value,
            logger(className) {
                progressSubject.next(className);
            },
        });

        const start = performance.now();
        taskSubject.next(task);
        task.start().then((total) => {
            const elapsed = (performance.now() - start) / 1000;
            modalApi.info({
                bodyProps: { "data-testid": "jar-decompiler-result" },
                content: `Decompiled ${total} new classes in ${elapsed.toFixed(3)} s.`,
                closable: true,
                keyboard: true,
                mask: { closable: true },
            });
        }).finally(() => {
            taskSubject.next(undefined);
            progressSubject.next(undefined);
        });
        progressSubject.next("Decompiling...");
    };

    const clearCache = (all: boolean) => {
        if (!jar) return;

        deleteCache(all ? null : jar.jar.name)
            .finally(() => messageApi.open({ type: "success", content: "Cache deleted" }));
    };


    return (
        <Modal
            title="Decompile Entire JAR"
            open={isModalOpen}
            onCancel={() => modalOpen.next(false)}
            onOk={onOk}
            okButtonProps={{ "data-testid": "jar-decompiler-ok" }}
        >
            {messageCtx}
            {modalCtx}
            <Alert
                type="warning"
                message="Decompiling the entire JAR will use large amount of resources and may crash the browser."
                description="If the browser crashed, simply reopen the page and you can continue decompiling the rest of the classes by opening this menu again."
            />
            <br />
            <Form layout="horizontal" labelCol={{ span: 9 }} wrapperCol={{ span: 8 }}>
                <BooleanOption setting={preferWasmDecompiler} title="Prefer WASM Decompiler" tooltip="WASM deompiler might be faster than JavaScript." />
                <NumberOption setting={decompilerThreads} title="Worker Threads" min={1} max={MAX_THREADS} />
                <NumberOption testid="jar-decompiler-splits" setting={decompilerSplits} title="Worker Splits" min={1} />
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
            mask={{ closable: false }}
            okButtonProps={{ "data-testid": "jar-decompiler-stop" }}
            onOk={() => {
                if (task) task.stop();
                taskSubject.next(undefined);
            }}
            okText={task ? "Stop" : "Stopping..."}
            footer={(_, { OkBtn }) => (
                <OkBtn />
            )}
        >
            <div data-testid="jar-decompiler-progress" style={{
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
};
