import { afterEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { jarIndex, type ClassData, type JarIndex } from '../workers/jar-index/client';
import { referencesQuery } from './State';
import { hierarchyNavigation } from './Inheritance';
import { HierarchyNavigation } from './HierarchyNavigation';
import { getNextJumpToken, goToReference, referenceResults, type ReferenceMatch } from './FindAllReferences';
import { includeMethodHierarchy } from './Settings';
import { toClassName } from '../utils/Names';
import type { MemberData, Method, ReferenceString } from '../workers/jar-index/types';
import type { DecompileResult } from '../workers/decompile/types';
import type { Token } from './Tokens';

vi.mock('../workers/jar-index/client', async () => {
    const { Subject } = await import('rxjs');
    return { jarIndex: new Subject() };
});
vi.mock('./State', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return { referencesQuery: new BehaviorSubject('') };
});
vi.mock('./Inheritance', async () => {
    const { BehaviorSubject } = await import('rxjs');
    return { hierarchyNavigation: new BehaviorSubject(null) };
});
vi.mock('./tabs', () => ({ openCodeTab: vi.fn() }));
vi.mock('./Settings', async () => {
    const { BehaviorSubject } = await import('rxjs');
    const observable = new BehaviorSubject(true);
    return {
        includeMethodHierarchy: {
            observable,
            get value() {
                return observable.value;
            },
            set value(value: boolean) {
                observable.next(value);
            },
        },
    };
});

const parent = toClassName('net/minecraft/Parent');
const child = toClassName('net/minecraft/Child');
const caller = toClassName('net/minecraft/Caller');
const parentKey: Method = `${parent}:run:()V`;
const childKey: Method = `${child}:run:()V`;
const commonReference: ReferenceString = `m:${caller}:both:()V`;
const parentReference: ReferenceString = `m:${caller}:parentOnly:()V`;
const childReference: ReferenceString = `m:${caller}:childOnly:()V`;
let subscriptions = new Subscription();

afterEach(() => {
    subscriptions.unsubscribe();
    subscriptions = new Subscription();
    referencesQuery.next('');
    includeMethodHierarchy.value = true;
    (hierarchyNavigation as BehaviorSubject<unknown>).next(null);
});

function createIndex(jarName = 'test.jar'): JarIndex {
    return {
        minecraftJar: { jar: { name: jarName } },
        getReference: vi.fn(async key => key === parentKey ? [parentReference, commonReference] : [childReference, commonReference]),
    } as unknown as JarIndex;
}

function loadHierarchy(jarName = 'test.jar') {
    const classes: ClassData[] = [
        { className: parent, superName: '', interfaces: [], accessFlags: 1 },
        { className: child, superName: parent, interfaces: [], accessFlags: 1 },
    ];
    const members: MemberData[] = [parentKey, childKey].map(key => ({
        className: toClassName(key.split(':')[0]), methods: [key], fields: [], methodAccess: { [key]: 1 }, methodBridges: {},
    }));
    (hierarchyNavigation as BehaviorSubject<unknown>).next({ jarName, index: new HierarchyNavigation(classes, members) });
}

function observeResults() {
    const results: ReferenceMatch[][] = [];
    subscriptions.add(referenceResults.subscribe(value => results.push(value)));
    return results;
}

describe('Hierarchy references', () => {
    it('includes hierarchy references by default and can switch to the exact search', async () => {
        const results = observeResults();
        (jarIndex as Subject<JarIndex>).next(createIndex());
        loadHierarchy();
        referencesQuery.next(childKey);
        await vi.waitFor(() => expect(results.at(-1)).toEqual([
            { reference: childReference, queries: [childKey] },
            { reference: commonReference, queries: [childKey, parentKey] },
            { reference: parentReference, queries: [parentKey] },
        ]));

        includeMethodHierarchy.value = false;
        await vi.waitFor(() => expect(results.at(-1)?.map(match => match.reference)).toEqual([childReference, commonReference]));
    });

    it('ignores stale searches and waits for hierarchy data from the selected jar', async () => {
        const results = observeResults();
        const oldIndex = createIndex();
        let finishOldSearch!: (references: ReferenceString[]) => void;
        oldIndex.getReference = vi.fn(() => new Promise<ReferenceString[]>(resolve => { finishOldSearch = resolve; }));
        (jarIndex as Subject<JarIndex>).next(oldIndex);
        loadHierarchy();
        referencesQuery.next(childKey);
        (jarIndex as Subject<JarIndex>).next(createIndex('new.jar'));
        loadHierarchy();
        loadHierarchy('new.jar');
        await vi.waitFor(() => expect(results.at(-1)).toHaveLength(3));
        finishOldSearch([`c:${parent}`]);
        await Promise.resolve();
        expect(results.at(-1)).toHaveLength(3);
    });

    it('jumps to the matching base call with a different descriptor', () => {
        const baseKey: Method = `${parent}:run:()Ljava/lang/Object;`;
        const selectedKey: Method = `${child}:run:()Ljava/lang/String;`;
        const declaration: Token = { type: 'method', className: caller, name: 'parentOnly', descriptor: '()V', declaration: true, start: 0, length: 1 };
        const call: Token = { type: 'method', className: parent, name: 'run', descriptor: '()Ljava/lang/Object;', declaration: false, start: 10, length: 1 };
        goToReference(selectedKey, parentReference, [baseKey]);
        const result = { className: caller, tokens: [declaration, call] } as DecompileResult;
        expect(getNextJumpToken(result)).toBe(call);
    });

    it('does not jump to a matching call in the next method', () => {
        const declaration: Token = { type: 'method', className: caller, name: 'parentOnly', descriptor: '()V', declaration: true, start: 0, length: 1 };
        const nextDeclaration: Token = { ...declaration, name: 'other', start: 10 };
        const call: Token = { type: 'method', className: parent, name: 'run', descriptor: '()V', declaration: false, start: 20, length: 1 };
        goToReference(childKey, parentReference, [parentKey]);
        const result = { className: caller, tokens: [declaration, nextDeclaration, call] } as DecompileResult;
        expect(getNextJumpToken(result)).toBe(declaration);
    });
});
