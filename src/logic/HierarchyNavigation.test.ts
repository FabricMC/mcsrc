import { describe, expect, it } from 'vitest';
import { HierarchyNavigation } from './HierarchyNavigation';
import { toClassName } from '../utils/Names';
import type { ClassData } from '../workers/jar-index/client';
import type { MemberData, Method } from '../workers/jar-index/types';
import type { Token } from './Tokens';

function classData(name: string, parents: string[] = []): ClassData {
    return { className: toClassName(name), superName: '', accessFlags: 1, interfaces: parents.map(toClassName) };
}

function memberData(name: string, descriptor = '()V', access = 1): MemberData {
    const key: Method = `${toClassName(name)}:run:${descriptor}`;
    return { className: toClassName(name), methods: [key], fields: [], methodAccess: { [key]: access }, methodBridges: {} };
}

function declaration(className: string, descriptor?: string): Token {
    const base = { className: toClassName(className), declaration: true, start: 0, length: 3 };
    if (descriptor) return { ...base, type: 'method', name: 'run', descriptor };
    return { ...base, type: 'class' };
}

function names(targets: { className: string }[]): string[] {
    return targets.map(target => target.className);
}

const classes = [classData('Parent'), classData('Other'), classData('Child', ['Parent', 'Other']), classData('Grandchild', ['Child'])];

describe('Hierarchy navigation', () => {
    it('links all supertypes and subtypes without duplicates through diamonds', () => {
        const index = new HierarchyNavigation([...classes, classData('Diamond', ['Child', 'Parent'])], []);
        expect(names(index.relations(declaration('Diamond')).parents)).toEqual(['Child', 'Other', 'Parent']);
        expect(names(index.relations(declaration('Parent')).children)).toEqual(['Child', 'Diamond', 'Grandchild']);
    });

    it('finds ancestor declarations and all descendant overrides through diamonds', () => {
        const diamond = [...classes, classData('Diamond', ['Child', 'Parent'])];
        const index = new HierarchyNavigation(diamond, ['Parent', 'Other', 'Child', 'Grandchild', 'Diamond'].map(name => memberData(name)));
        expect(names(index.relations(declaration('Grandchild', '()V')).parents)).toEqual(['Child', 'Other', 'Parent']);
        expect(names(index.relations(declaration('Parent', '()V')).children)).toEqual(['Child', 'Diamond', 'Grandchild']);
    });

    it('does not confuse overloads, static methods, private methods, or final methods with overrides', () => {
        for (const access of [2, 8, 16]) {
            const index = new HierarchyNavigation(classes, [memberData('Parent', '()V', access), memberData('Child')]);
            expect(index.relations(declaration('Child', '()V')).parents).toEqual([]);
        }
        const index = new HierarchyNavigation(classes, [memberData('Parent', '(I)V'), memberData('Child')]);
        expect(index.relations(declaration('Child', '()V')).parents).toEqual([]);
        expect(index.relations({ ...declaration('Parent', '(I)V'), name: '<init>' } as Token).children).toEqual([]);
    });

    it('respects package visibility', () => {
        const index = new HierarchyNavigation([
            classData('a/Parent'), classData('a/Child', ['a/Parent']), classData('b/Child', ['a/Parent']),
        ], [memberData('a/Parent', '()V', 0), memberData('a/Child'), memberData('b/Child')]);
        expect(names(index.relations(declaration('a/Parent', '()V')).children)).toEqual(['a/Child']);
    });

    it('supports covariant returns and rejects unrelated return types', () => {
        const index = new HierarchyNavigation(classes, [memberData('Parent', '()LParent;'), memberData('Child', '()LChild;'), memberData('Grandchild', '()LOther;')]);
        expect(names(index.relations(declaration('Parent', '()LParent;')).children)).toEqual(['Child']);
        expect(names(index.relations(declaration('Child', '()LChild;')).parents)).toEqual(['Parent']);
    });

    it('uses bridge delegation to navigate generic overrides even with overloads', () => {
        const child = memberData('Child', '(Ljava/lang/String;)Ljava/lang/String;');
        const bridge: Method = `${toClassName('Child')}:run:(Ljava/lang/Object;)Ljava/lang/Object;`;
        const overload: Method = `${toClassName('Child')}:run:(I)V`;
        child.methods.push(bridge, overload);
        child.methodAccess[bridge] = 0x1041;
        child.methodAccess[overload] = 1;
        child.methodBridges[bridge] = child.methods[0];
        const index = new HierarchyNavigation(classes, [memberData('Parent', '(Ljava/lang/Object;)Ljava/lang/Object;'), child]);
        const children = index.relations(declaration('Parent', '(Ljava/lang/Object;)Ljava/lang/Object;')).children;
        expect(children).toHaveLength(1);
        expect(children[0].descriptor).toBe('(Ljava/lang/String;)Ljava/lang/String;');
        expect(names(index.relations(declaration('Child', '(Ljava/lang/String;)Ljava/lang/String;')).parents)).toEqual(['Parent']);
        expect(index.relations(declaration('Child', '(I)V')).parents).toEqual([]);
    });

    it('ignores references and handles missing classes and cycles', () => {
        const index = new HierarchyNavigation([classData('A', ['B']), classData('B', ['A'])], []);
        expect(index.relations(declaration('Missing'))).toEqual({ parents: [], children: [] });
        expect(index.relations({ ...declaration('A'), declaration: false })).toEqual({ parents: [], children: [] });
        expect(names(index.relations(declaration('A')).parents)).toEqual(['B']);
    });

    it('expands a child method to bases, siblings, descendants, and inherited reference owners', () => {
        const index = new HierarchyNavigation([
            classData('Parent'), classData('Child', ['Parent']), classData('Sibling', ['Parent']),
            classData('Inherited', ['Child']), classData('Unrelated'),
        ], [memberData('Parent'), memberData('Child'), memberData('Sibling'), memberData('Unrelated')]);
        expect(index.methodHierarchy(toClassName('Child'), 'run', '()V').sort()).toEqual([
            'Child:run:()V', 'Inherited:run:()V', 'Parent:run:()V', 'Sibling:run:()V',
        ]);
    });

    it('includes generic bridge keys without including overloads', () => {
        const child = memberData('Child', '(Ljava/lang/String;)Ljava/lang/String;');
        const bridge: Method = `${toClassName('Child')}:run:(Ljava/lang/Object;)Ljava/lang/Object;`;
        child.methods.push(bridge);
        child.methodAccess[bridge] = 0x1041;
        child.methodBridges[bridge] = child.methods[0];
        const index = new HierarchyNavigation(classes, [memberData('Parent', '(Ljava/lang/Object;)Ljava/lang/Object;'), child]);
        const keys = index.methodHierarchy(toClassName('Child'), 'run', '(Ljava/lang/String;)Ljava/lang/String;');
        expect(keys).toEqual(expect.arrayContaining(['Parent:run:(Ljava/lang/Object;)Ljava/lang/Object;', bridge]));
        expect(index.methodHierarchy(toClassName('Child'), 'run', '(I)V')).toEqual(['Child:run:(I)V']);
    });

    it('keeps static and private declarations out of an override family', () => {
        for (const access of [2, 8]) {
            const index = new HierarchyNavigation(classes, [memberData('Parent'), memberData('Child', '()V', access)]);
            expect(index.methodHierarchy(toClassName('Parent'), 'run', '()V')).not.toContain('Child:run:()V');
        }
    });

    it('includes covariant descriptors but excludes unrelated returns and inaccessible inherited methods', () => {
        const index = new HierarchyNavigation(classes, [
            memberData('Parent', '()LParent;'), memberData('Child', '()LChild;'), memberData('Grandchild', '()LOther;'),
        ]);
        const keys = index.methodHierarchy(toClassName('Child'), 'run', '()LChild;');
        expect(keys).toContain('Parent:run:()LParent;');
        expect(keys).not.toContain('Grandchild:run:()LOther;');

        const packageIndex = new HierarchyNavigation([
            classData('a/Parent'), classData('a/Child', ['a/Parent']), classData('b/Child', ['a/Parent']),
        ], [memberData('a/Parent', '()V', 0)]);
        expect(packageIndex.methodHierarchy(toClassName('a/Parent'), 'run', '()V').sort()).toEqual([
            'a/Child:run:()V', 'a/Parent:run:()V',
        ]);
    });
});
