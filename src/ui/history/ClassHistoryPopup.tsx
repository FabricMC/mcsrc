import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Flex, Popover, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { VersionListEntry } from '../../logic/MinecraftApi';
import { diffLeftSelectedMinecraftVersion, diffSelectionSide, diffView, selectedLines, selectedMinecraftVersion } from '../../logic/State';
import { openCodeTab } from '../../logic/tabs';
import { toClassFilePath, type ClassName } from '../../utils/Names';
import { ClassHistoryList } from './ClassHistoryList';

export interface HistoryChooser {
    className: ClassName;
    versions: VersionListEntry[];
    currentVersion: string;
    x: number;
    y: number;
}

export function ClassHistoryPopup({ chooser, onClose }: { chooser: HistoryChooser; onClose: () => void }) {
    // Popup motion changes row coordinates without triggering a resize.
    const [ready, setReady] = useState(false);

    useEffect(() => {
        function dismiss(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', dismiss);
        return () => document.removeEventListener('keydown', dismiss);
    }, [onClose]);

    function compareVersion(version: string) {
        onClose();
        diffLeftSelectedMinecraftVersion.next(chooser.currentVersion);
        selectedMinecraftVersion.next(version);
        diffSelectionSide.next(null);
        selectedLines.next(null);
        openCodeTab(toClassFilePath(chooser.className));
        diffView.next(true);
    }

    return createPortal(<Popover
        open
        arrow={false}
        placement="bottomLeft"
        trigger="click"
        afterOpenChange={setReady}
        onOpenChange={open => {
            if (!open) onClose();
        }}
        content={<Flex vertical gap={4} style={{ width: 'min(360px, calc(100vw - 48px))' }} role="dialog" aria-label="Class history">
            <Flex align="center" justify="space-between">
                <Typography.Text strong>Class history</Typography.Text>
                <Button size="small" type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Close class history" />
            </Flex>
            <ClassHistoryList versions={chooser.versions} className={chooser.className}
                currentVersion={chooser.currentVersion} onSelect={compareVersion} active={ready} />
        </Flex>}
    >
        <span style={{ position: 'fixed', left: chooser.x, top: chooser.y, width: 1, height: 1 }} />
    </Popover>, document.body);
}

