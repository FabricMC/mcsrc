import { Select } from "antd";
import { useObservable } from "../../utils/UseObservable";
import { minecraftVersionIds } from "../../logic/MinecraftApi";
import { getLeftDiff, getRightDiff } from "../../logic/Diff";

const DiffVersionSelection = () => {
    const versions = useObservable(minecraftVersionIds);
    const leftVersion = useObservable(getLeftDiff().selectedVersion);
    const rightVersion = useObservable(getRightDiff().selectedVersion);

    if (!leftVersion) {
        // This will trigger the jar to load
        getLeftDiff().selectedVersion.next(versions?.[1] || null);
    }

    return (
        <>
            <Select
                value={leftVersion || versions?.[1]} // Select second version as default for left side
                onChange={(v) => {
                    getLeftDiff().selectedVersion.next(v);
                }}
            >
                {versions?.map(v => (
                    <Select.Option key={v} value={v}>{v}</Select.Option>
                ))}
            </Select>
            <span style={{ fontSize: 12, color: '#888' }}>→</span>
            <Select
                value={rightVersion || versions?.[0]}
                onChange={(v) => {
                    getRightDiff().selectedVersion.next(v);
                }}
            >
                {versions?.map(v => (
                    <Select.Option key={v} value={v}>{v}</Select.Option>
                ))}
            </Select>
        </>
    );
};

export default DiffVersionSelection;
