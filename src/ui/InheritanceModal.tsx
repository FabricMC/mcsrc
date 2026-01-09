import { lazy, Suspense } from "react";
import { Modal, Spin } from "antd";
import { useObservable } from "../utils/UseObservable";
import { selectedInheritanceClassName, selectedInheritanceClassNode } from "../logic/Inheritance";

const Inheritance = lazy(() => import("./Inheritance"));

const InheritanceModal = () => {
    const data = useObservable(selectedInheritanceClassNode);

    return (
        <Modal
            title={data ? `Inheritance for ${data.name}` : "No class selected"}
            open={data !== null}
            footer={null}
            onCancel={() => selectedInheritanceClassName.next(null)}
            width="90%"
            style={{ top: 20 }}
        >
            {data ? (
                <Suspense fallback={<div style={{ textAlign: 'center', padding: '20px' }}><Spin /></div>}>
                    <Inheritance data={data} />
                </Suspense>
            ) : (
                <p>No class selected.</p>
            )}
        </Modal>
    );
};

export default InheritanceModal;