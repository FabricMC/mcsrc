import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject, Subscription } from 'rxjs';
import { jarIndex, type ClassData, type JarIndex } from '../workers/jar-index/client';
import { hierarchyNavigation } from './Inheritance';

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
