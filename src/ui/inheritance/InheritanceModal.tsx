import { Modal, Spin, Tabs } from "antd";
import { lazy, Suspense } from "react";

import {
  ClassNode,
  selectedInheritanceClassName,
  selectedInheritanceClassNode,
} from "../../logic/Inheritance";
import { useObservable } from "../../utils/UseObservable";

const InheritanceTree = lazy(() => import("./InheritanceTree"));
const InheritanceGraph = lazy(() => import("./InheritanceGraph"));

const Inheritance = ({ data }: { data: ClassNode }) => {
  const items = [
    {
      key: "tree",
      label: "Tree",
      children: <InheritanceTree data={data} />,
    },
    {
      key: "graph",
      label: "Graph",
      children: <InheritanceGraph data={data} />,
    },
  ];

  return <Tabs defaultActiveKey="tree" items={items} />;
};

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
        <Suspense
          fallback={
            <div style={{ textAlign: "center", padding: "20px" }}>
              <Spin />
            </div>
          }
        >
          <Inheritance data={data} />
        </Suspense>
      ) : (
        <p>No class selected.</p>
      )}
    </Modal>
  );
};

export default InheritanceModal;
