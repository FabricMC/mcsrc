import {
  Button,
  Modal,
  type CheckboxProps,
  Form,
  Tooltip,
  InputNumber,
  type InputNumberProps,
} from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { Checkbox } from "antd";
import { useObservable } from "../utils/UseObservable";
import {
  BooleanSetting,
  enableTabs,
  displayLambdas,
  focusSearch,
  KeybindSetting,
  type KeybindValue,
  bytecode,
  showStructure,
  NumberSetting,
  preferWasmDecompiler,
  compactPackages,
} from "../logic/Settings";
import { capturingKeybind, rawKeydownEvent } from "../logic/Keybinds";
import { BehaviorSubject } from "rxjs";
import type React from "react";

export const settingsModalOpen = new BehaviorSubject<boolean>(false);

export const SettingsModalButton = () => {
  return (
    <Button type="default" onClick={() => settingsModalOpen.next(true)}>
      <SettingOutlined />
    </Button>
  );
};

const SettingsModal = () => {
  const isModalOpen = useObservable(settingsModalOpen);
  const displayLambdasValue = useObservable(displayLambdas.observable);
  const bytecodeValue = useObservable(bytecode.observable);

  return (
    <Modal
      title="Settings"
      open={isModalOpen}
      onCancel={() => settingsModalOpen.next(false)}
      footer={null}
    >
      <Form layout="horizontal" labelCol={{ span: 9 }} wrapperCol={{ span: 16 }}>
        <BooleanOption setting={enableTabs} title={"Enable Tabs"} />
        <BooleanOption
          setting={compactPackages}
          title={"Compact Packages"}
          tooltip="Collapse packages with one child into one."
        />
        <BooleanOption
          setting={displayLambdas}
          title={"Lambda Names"}
          tooltip="Display lambda names as inline comments. Does not support permalinking."
          disabled={bytecodeValue}
        />
        <BooleanOption
          setting={bytecode}
          title={"Show Bytecode"}
          tooltip="Show bytecode instructions alongside decompiled source. Does not support permalinking."
          disabled={displayLambdasValue}
        />
        <BooleanOption
          setting={preferWasmDecompiler}
          title={"Prefer WASM Decompiler"}
          tooltip="WASM deompiler might be faster than JavaScript."
        />
        <KeybindOption setting={focusSearch} title={"Focus Search"} captureId="focus_search" />
        <KeybindOption
          setting={showStructure}
          title={"Show Structure"}
          captureId="show_structure"
        />
      </Form>
    </Modal>
  );
};

export interface BooleanOptionProps {
  setting: BooleanSetting;
  title: string;
  tooltip?: string;
  disabled?: boolean;
}

export const BooleanOption: React.FC<BooleanOptionProps> = ({
  setting,
  title,
  tooltip,
  disabled,
}) => {
  const value = useObservable(setting.observable);
  const onChange: CheckboxProps["onChange"] = (e) => {
    setting.value = e.target.checked;
  };

  const checkbox = <Checkbox checked={value} onChange={onChange} disabled={disabled} />;

  return (
    <Form.Item label={title}>
      {tooltip ? <Tooltip title={tooltip}>{checkbox}</Tooltip> : checkbox}
    </Form.Item>
  );
};

export interface NumberOptionProps {
  setting: NumberSetting;
  title: string;
  min?: number;
  max?: number;
  testid?: string;
}

export const NumberOption: React.FC<NumberOptionProps> = ({ setting, title, min, max, testid }) => {
  const value = useObservable(setting.observable);
  const onChange: InputNumberProps<number>["onChange"] = (e) => {
    setting.value = e ?? setting.defaultValue;
  };

  return (
    <Form.Item label={title}>
      <InputNumber data-testid={testid} min={min} max={max} value={value} onChange={onChange} />
    </Form.Item>
  );
};

interface KeybindOptionProps {
  setting: KeybindSetting;
  title: string;
  captureId: string;
}

const KeybindOption: React.FC<KeybindOptionProps> = ({ setting, title, captureId }) => {
  const value = useObservable(setting.observable);
  const capturing = useObservable(capturingKeybind);
  const isCapturing = capturing === captureId;

  const startCapture = () => {
    if (capturingKeybind.value !== null) {
      return;
    }
    capturingKeybind.next(captureId);
    const subscription = rawKeydownEvent.subscribe((event) => {
      event.preventDefault();

      // Only capture if a non-modifier key is pressed
      const modifierKeys = ["Control", "Alt", "Shift", "Meta"];
      if (!modifierKeys.includes(event.key)) {
        setting.setFromEvent(event);
        capturingKeybind.next(null);
        subscription.unsubscribe();
      }
    });
  };

  const formatKeybind = (keybind: KeybindValue | undefined): string => {
    if (!keybind) return "Not set";
    return keybind
      .split("+")
      .map((k) => {
        if (k == " ") return "<space>";
        const key = k.trim();
        return key.charAt(0).toUpperCase() + key.slice(1);
      })
      .join("+");
  };

  return (
    <Form.Item label={title}>
      <Button onClick={startCapture} type={isCapturing ? "primary" : "default"}>
        {isCapturing ? "Press keys..." : formatKeybind(value)}
      </Button>
      <Button onClick={() => setting.reset()} style={{ marginLeft: "8px" }}>
        Reset
      </Button>
    </Form.Item>
  );
};

export default SettingsModal;
