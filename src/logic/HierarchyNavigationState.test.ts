import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { jarIndex, type ClassData, type JarIndex } from '../workers/jar-index/client';
import { automaticHierarchyNavigation, hierarchyNavigation } from './Inheritance';
import { autoJarIndex } from './Settings';

vi.mock('./Settings', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return { autoJarIndex: { observable: new BehaviorSubject(true) } };
});

vi.mock('../workers/jar-index/client', async () => {
    const { Subject } = await import('rxjs');
    return { jarIndex: new Subject() };
});

vi.mock('./MinecraftApi', async () => {
    const { Subject } = await import('rxjs');
    return { minecraftJar: new Subject() };
});

const indexes = jarIndex as Subject<JarIndex>;
let subscriptions = new Subscription();

afterEach(() => {
    subscriptions.unsubscribe();
    subscriptions = new Subscription();
    (autoJarIndex.observable as BehaviorSubject<boolean>).next(true);
    vi.restoreAllMocks();
});

function createIndex(jarName: string, classes: Promise<ClassData[]>): JarIndex {
    return {
        minecraftJar: { jar: { name: jarName } },
        getClassData: vi.fn(() => classes),
        getMemberData: vi.fn(async () => []),
    } as unknown as JarIndex;
}

function observeNavigation(): (string | null)[] {
    const names: (string | null)[] = [];
    subscriptions.add(hierarchyNavigation.subscribe(state => names.push(state?.jarName ?? null)));
    return names;
}

describe('Hierarchy navigation state', () => {
    it('skips automatic indexing when disabled but allows explicit hierarchy requests', async () => {
        (autoJarIndex.observable as BehaviorSubject<boolean>).next(false);
        subscriptions.add(automaticHierarchyNavigation.subscribe());
        const index = createIndex('explicit.jar', Promise.resolve([]));
        indexes.next(index);
        expect(index.getClassData).not.toHaveBeenCalled();
        expect(index.getMemberData).not.toHaveBeenCalled();

        const names = observeNavigation();
        indexes.next(index);
        await vi.waitFor(() => expect(names.at(-1)).toBe('explicit.jar'));
        expect(index.getMemberData).toHaveBeenCalledOnce();
    });

    it('starts automatic indexing when enabled and ignores a pending result after disabling', async () => {
        const enabled = autoJarIndex.observable as BehaviorSubject<boolean>;
        enabled.next(false);
        const names: (string | null)[] = [];
        subscriptions.add(automaticHierarchyNavigation.subscribe(state => names.push(state?.jarName ?? null)));
        let finishLoad!: (classes: ClassData[]) => void;
        const classes = new Promise<ClassData[]>(resolve => { finishLoad = resolve; });
        const index = createIndex('automatic.jar', classes);

        enabled.next(true);
        indexes.next(index);
        expect(index.getMemberData).toHaveBeenCalledOnce();
        enabled.next(false);
        const disabledNames = [...names];
        finishLoad([]);
        await classes;
        await Promise.resolve();
        expect(names).toEqual(disabledNames);
        expect(names.at(-1)).toBeNull();
    });

    it('ignores an older jar load that completes after the selected jar', async () => {
        let finishOldLoad!: (classes: ClassData[]) => void;
        const oldClasses = new Promise<ClassData[]>(resolve => {
            finishOldLoad = resolve;
        });
        const names = observeNavigation();

        indexes.next(createIndex('old.jar', oldClasses));
        indexes.next(createIndex('new.jar', Promise.resolve([])));
        await vi.waitFor(() => expect(names).toEqual([null, null, 'new.jar']));

        finishOldLoad([]);
        await oldClasses;
        await Promise.resolve();
        expect(names).toEqual([null, null, 'new.jar']);
    });

    it('recovers from a failed load when another jar is selected', async () => {
        const error = new Error('Index unavailable');
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const names = observeNavigation();

        indexes.next(createIndex('broken.jar', Promise.reject(error)));
        await vi.waitFor(() => expect(errorLog).toHaveBeenCalledWith('Failed to load hierarchy navigation', error));
        expect(names).toEqual([null, null]);

        indexes.next(createIndex('working.jar', Promise.resolve([])));
        await vi.waitFor(() => expect(names.at(-1)).toBe('working.jar'));
    });

    it('shares metadata loading and releases its source after the last subscriber leaves', async () => {
        const first = observeNavigation();
        const second = observeNavigation();
        const index = createIndex('shared.jar', Promise.resolve([]));

        indexes.next(index);
        await vi.waitFor(() => expect(first).toEqual([null, 'shared.jar']));
        expect(second).toEqual(first);
        expect(index.getClassData).toHaveBeenCalledTimes(1);
        expect(index.getMemberData).toHaveBeenCalledTimes(1);

        subscriptions.unsubscribe();
        const unused = createIndex('unused.jar', Promise.resolve([]));
        indexes.next(unused);
        expect(unused.getClassData).not.toHaveBeenCalled();
    });
});
