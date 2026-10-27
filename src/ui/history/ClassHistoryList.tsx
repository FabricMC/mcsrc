import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animationFrameScheduler, auditTime, fromEvent, merge, Observable, startWith } from 'rxjs';
import { Button, Empty, Flex, Timeline, Typography, theme } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { classHistoryBounds, compareClassFingerprints, type ClassHistoryEntry } from '../../logic/ClassHistory';
import { createClassHistoryLoader } from '../../logic/ClassHistoryLoader';
import type { VersionListEntry } from '../../logic/MinecraftApi';
import type { ClassName } from '../../utils/Names';

const changeLabels = {
    changed: 'Changed',
    unchanged: 'Unchanged',
    added: 'Added',
    removed: 'Removed',
};

interface ScrollAnchor {
    version: string;
    offset: number;
}

function captureScrollAnchor(list: HTMLElement, retainedEntries: ClassHistoryEntry[]): ScrollAnchor | null {
    const retainedVersions = new Set(retainedEntries.map(entry => entry.version));
    const bounds = list.getBoundingClientRect();
    for (const row of list.querySelectorAll<HTMLElement>('[data-version]')) {
        const version = row.dataset.version;
        if (!version || !retainedVersions.has(version)) continue;
        const position = row.getBoundingClientRect();
        if (position.bottom > bounds.top && position.top < bounds.bottom) {
            return { version, offset: position.top - bounds.top };
        }
    }
    return null;
}

export function ClassHistoryList({ versions, className, currentVersion, onSelect, active, disabled = false }: {
    versions: VersionListEntry[];
    className: ClassName;
    currentVersion: string;
    onSelect: (version: string) => void;
    active: boolean;
    disabled?: boolean;
}) {
    const { token } = theme.useToken();
    const [entries, setEntries] = useState<ClassHistoryEntry[]>(() => versions.map(version => ({ version: version.id, status: 'queued' })));
    const listRef = useRef<HTMLDivElement>(null);
    const scrollAnchor = useRef<ScrollAnchor | null>(null);

    useLayoutEffect(() => {
        const list = listRef.current;
        const anchor = scrollAnchor.current;
        scrollAnchor.current = null;
        if (!list || !anchor) return;
        const row = Array.from(list.querySelectorAll<HTMLElement>('[data-version]'))
            .find(row => row.dataset.version === anchor.version);
        if (row) list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
    }, [entries]);

    useEffect(() => {
        const list = listRef.current;
        if (!list || !active) return;
        const currentRow = list.querySelector<HTMLElement>('.class-history-current');
        if (currentRow) {
            const rowBounds = currentRow.getBoundingClientRect();
            list.scrollTop += rowBounds.top - list.getBoundingClientRect().top - (list.clientHeight - rowBounds.height) / 2;
        }
        const loader = createClassHistoryLoader(versions, className, currentVersion, updated => {
            const { firstIndex, lastIndex } = classHistoryBounds(updated, currentVersion);
            const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-version]'));
            if (rows[0]?.dataset.version !== versions[firstIndex].id || rows.at(-1)?.dataset.version !== versions[lastIndex].id) {
                // Preserve the viewport when a boundary removes rows above it.
                scrollAnchor.current = captureScrollAnchor(list, updated.slice(firstIndex, lastIndex + 1));
            }
            setEntries(updated);
        });
        const loadVisible = () => {
            const bounds = list.getBoundingClientRect();
            const visible: string[] = [];
            let previousVisible = false;
            for (const row of list.querySelectorAll<HTMLElement>('[data-version]')) {
                const position = row.getBoundingClientRect();
                const inView = position.bottom > bounds.top && position.top < bounds.bottom;
                if (inView || previousVisible) visible.push(row.dataset.version!);
                previousVisible = inView;
            }
            loader.setVisibleVersions(visible);
        };

        const resizes = new Observable<void>(subscriber => {
            const observer = new ResizeObserver(() => subscriber.next());
            observer.observe(list);
            if (list.firstElementChild) observer.observe(list.firstElementChild);
            return () => observer.disconnect();
        });
        const subscription = merge(fromEvent(list, 'scroll', { passive: true }), resizes).pipe(
            startWith(undefined),
            auditTime(0, animationFrameScheduler),
        ).subscribe(loadVisible);
        return () => {
            subscription.unsubscribe();
            loader.dispose();
        };
    }, [versions, className, active, currentVersion]);

    const { firstIndex, lastIndex } = classHistoryBounds(entries, currentVersion);
    const colors = {
        changed: token.colorPrimary,
        added: token.colorSuccess,
        removed: token.colorError,
        unchanged: token.colorTextTertiary,
    };
    const items = entries.slice(firstIndex, lastIndex + 1).map((entry, offset) => {
        const index = firstIndex + offset;
        const older = entries[index + 1];
        const isCurrent = entry.version === currentVersion;
        const change = entry.fingerprint !== undefined && older?.fingerprint !== undefined
            ? compareClassFingerprints(entry.fingerprint, older.fingerprint) : undefined;
        const color = change ? colors[change] : token.colorTextTertiary;
        const isBoundary = change === 'added' || change === 'removed';
        let status = entry.fingerprint === null ? 'Not present' : '';
        if (change) status = changeLabels[change];
        if (entry.status === 'error') status = 'Failed to load';
        let label = entry.version;
        if (isCurrent) {
            label = `${entry.version}, current version`;
        } else if (!disabled) {
            label = `Compare ${currentVersion} with ${entry.version}`;
        }

        return {
            key: entry.version,
            color,
            content: <Button
                type="text"
                size="small"
                block
                data-version={entry.version}
                className={isCurrent ? 'class-history-current' : undefined}
                style={{ height: 30 }}
                disabled={isCurrent || disabled}
                aria-label={label}
                onClick={() => onSelect(entry.version)}
            >
                <Flex align="center" justify="space-between" gap={12} style={{ width: '100%', minWidth: 0 }}>
                    <Typography.Text ellipsis strong={isCurrent} style={{ color: isBoundary ? color : token.colorText }}>
                        {entry.version}
                    </Typography.Text>
                    <Typography.Text style={{ color, flexShrink: 0 }}>
                        {entry.status === 'checking' ? <LoadingOutlined spin aria-label="Loading" /> : status}
                    </Typography.Text>
                </Flex>
            </Button>,
        };
    });

    return <div
        className="class-history-entries"
        ref={listRef}
        onWheel={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
    >
        {items.length > 0 ? <Timeline items={items} styles={{
            item: { minHeight: 30, paddingBottom: 0 },
            itemWrapper: { alignItems: 'center' },
            itemIcon: { marginBlockStart: 0 },
            // Extend the rail to the neighbouring dot in the compact rows.
            itemRail: { top: 19, bottom: -11 },
            itemSection: { flex: 1, minWidth: 0 },
            itemContent: { paddingBottom: 0 },
        }} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No versions" />}
    </div>;
}

