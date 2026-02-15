import { Modal } from "antd";
import { useEffect, useState } from "react";

import { showStructureEvent } from "../logic/Keybinds";
import { useObservable } from "../utils/UseObservable";
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
