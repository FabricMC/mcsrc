import { Modal } from "antd";
import { useEffect, useState } from "react";
import { useObservable } from "../utils/UseObservable";
import { showStructureEvent } from "../logic/Keybinds";
import StructureView from "./StructureView";

const StructureModal = () => {
  const showEvent = useObservable(showStructureEvent);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (showEvent) {
      setOpen(true);
    }
  }, [showEvent]);

  return (
    <Modal
      title="Structure"
      open={open}
      onCancel={() => setOpen(false)}
      footer={null}
      width={"fit-content"}
      styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
    >
      <StructureView onNavigate={() => setOpen(false)} />
    </Modal>
  );
};

export default StructureModal;
