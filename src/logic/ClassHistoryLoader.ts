import { fetchClassFingerprint, classHistoryBounds, type ClassHistoryEntry } from './ClassHistory';
import type { VersionListEntry } from './MinecraftApi';
import type { ClassName } from '../utils/Names';

const maxConcurrentRequests = 4;

export function createClassHistoryLoader(
    versions: VersionListEntry[], className: ClassName, currentVersion: string,
    onUpdate: (entries: ClassHistoryEntry[]) => void,
) {
    let entries: ClassHistoryEntry[] = versions.map(version => ({ version: version.id, status: 'queued' }));
    const indexedVersions = versions.map((version, index) => ({ version, index }));
    const currentIndex = versions.findIndex(version => version.id === currentVersion);
    const running = new Map<number, AbortController>();
    let visible = new Set<string>();
    let disposed = false;

    function update(index: number, entry: ClassHistoryEntry) {
        entries = [...entries];
        entries[index] = entry;
    }

    async function load(index: number, controller: AbortController) {
        const version = versions[index].id;
        try {
            const fingerprint = await fetchClassFingerprint(versions[index], className, controller.signal);
            if (!disposed && !controller.signal.aborted) {
                update(index, { version, status: 'checked', fingerprint });
            }
        } catch (error) {
            if (!disposed && !controller.signal.aborted) {
                update(index, { version, status: 'error', error: String(error) });
            }
        } finally {
            running.delete(index);
            reconcile();
        }
    }

    function reconcile() {
        if (disposed) return;
        const { firstIndex, lastIndex } = classHistoryBounds(entries, currentVersion);
        const wanted = indexedVersions.filter(({ version, index }) => visible.has(version.id) && index >= firstIndex && index <= lastIndex);
        const wantedIndexes = new Set(wanted.map(({ index }) => index));
        for (const [index, controller] of running) {
            if (!wantedIndexes.has(index) && !controller.signal.aborted) {
                controller.abort();
                update(index, { version: versions[index].id, status: 'queued' });
            }
        }

        wanted.sort((left, right) => Math.abs(left.index - currentIndex) - Math.abs(right.index - currentIndex));
        for (const { version, index } of wanted) {
            if (running.size >= maxConcurrentRequests) break;
            if (running.has(index) || entries[index].status !== 'queued') continue;
            const controller = new AbortController();
            running.set(index, controller);
            update(index, { version: version.id, status: 'checking' });
            void load(index, controller);
        }
        onUpdate(entries);
    }

    return {
        setVisibleVersions(versionIds: string[]) {
            visible = new Set(versionIds);
            reconcile();
        },
        dispose() {
            disposed = true;
            for (const controller of running.values()) controller.abort();
        },
    };
}
