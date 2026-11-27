import { Checkbox, Flex, Form, InputNumber, Switch, Tooltip, Typography, type CheckboxProps, type InputNumberProps } from "antd";
import { useId, type FC } from "react";
import { BooleanSetting, NumberSetting } from "../../logic/Settings";
import { useObservable } from "../../utils/UseObservable";

export const SettingSwitch = ({ setting, title, description, disabled }: {
    setting: BooleanSetting;
    title: string;
    description: string;
    disabled?: boolean;
}) => {
    const value = useObservable(setting.observable);
    const id = useId();

    return (
        <Flex align="center" justify="space-between" gap="middle">
            <Flex vertical gap={4}>
                <label htmlFor={id}>{title}</label>
                <Typography.Text type="secondary" id={`${id}-description`}>{description}</Typography.Text>
            </Flex>
            <Switch
                id={id}
                aria-label={title}
                aria-describedby={`${id}-description`}
                checked={value}
                disabled={disabled}
                onChange={value => setting.value = value}
            />
        </Flex>
    );
};

export interface BooleanOptionProps {
    setting: BooleanSetting;
    title: string;
    tooltip?: string;
    disabled?: boolean;
}

export const BooleanOption: FC<BooleanOptionProps> = ({ setting, title, tooltip, disabled }) => {
    const value = useObservable(setting.observable);
    const onChange: CheckboxProps['onChange'] = (e) => {
        setting.value = e.target.checked;
    };

    const checkbox = <Checkbox aria-label={title} checked={value} onChange={onChange} disabled={disabled} />;

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

export const NumberOption: FC<NumberOptionProps> = ({ setting, title, min, max, testid }) => {
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
