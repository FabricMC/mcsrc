import type { ClassData } from '../workers/jar-index/client';
import type { MemberData } from '../workers/jar-index/types';
import type { ClassName } from '../utils/Names';
import type { Token } from './Tokens';
import { isAbstract, isInterface } from '../utils/Classfile';

const PRIVATE = 0x0002;
const STATIC = 0x0008;
const FINAL = 0x0010;
const BRIDGE = 0x0040;
const SYNTHETIC = 0x1000;
const PUBLIC_OR_PROTECTED = 0x0005;

export interface HierarchyTarget {
    className: ClassName;
    type: 'class' | 'method';
    name?: string;
    descriptor?: string;
}

export interface HierarchyRelations {
    parents: HierarchyTarget[];
    children: HierarchyTarget[];
}

interface MethodDeclaration extends HierarchyTarget {
    type: 'method';
    name: string;
    descriptor: string;
    access: number;
    bridgeTarget?: string;
}

export class HierarchyNavigation {
    private readonly classes: Map<ClassName, ClassData>;
    private readonly children = new Map<ClassName, ClassName[]>();
    private readonly methods = new Map<ClassName, MethodDeclaration[]>();
    private readonly methodsByName = new Map<string, MethodDeclaration[]>();
    private readonly ancestors = new Map<ClassName, Set<ClassName>>();

    constructor(classes: ClassData[], members: MemberData[]) {
        this.classes = new Map(classes.map(data => [data.className, data]));
        for (const data of classes) {
            for (const parent of this.parentNames(data.className)) {
                const children = this.children.get(parent) ?? [];
                children.push(data.className);
                this.children.set(parent, children);
            }
        }
        for (const data of members) {
            const methods: MethodDeclaration[] = [];
            for (const key of data.methods) {
                const [, name, descriptor] = key.split(':');
                const access = data.methodAccess[key];
                if (access === undefined || name.startsWith('<') || (access & (PRIVATE | STATIC)) !== 0) {
                    continue;
                }
                const method: MethodDeclaration = {
                    className: data.className,
                    type: 'method',
                    name,
                    descriptor,
                    access,
                    bridgeTarget: data.methodBridges[key],
                };
                methods.push(method);
                const matchingNames = this.methodsByName.get(name) ?? [];
                matchingNames.push(method);
                this.methodsByName.set(name, matchingNames);
            }
            this.methods.set(data.className, methods);
        }
    }

    private parentNames(className: ClassName): ClassName[] {
        const data = this.classes.get(className);
        if (!data) return [];
        const parents = [...data.interfaces];
        if (data.superName) parents.unshift(data.superName);
        return parents.filter(parent => this.classes.has(parent));
    }

    private ancestorNames(className: ClassName): Set<ClassName> {
        const cached = this.ancestors.get(className);
        if (cached) return cached;
        const ancestors = new Set<ClassName>();
        const pending = this.parentNames(className);
        while (pending.length > 0) {
            const parent = pending.pop()!;
            if (parent === className || ancestors.has(parent)) continue;
            ancestors.add(parent);
            pending.push(...this.parentNames(parent));
        }
        this.ancestors.set(className, ancestors);
        return ancestors;
    }

    private overrides(child: MethodDeclaration, parent: MethodDeclaration): boolean {
        if (child.name !== parent.name || (parent.access & FINAL) !== 0) return false;
        if ((parent.access & PUBLIC_OR_PROTECTED) === 0) {
            const parentPackage = parent.className.slice(0, parent.className.lastIndexOf('/'));
            const childPackage = child.className.slice(0, child.className.lastIndexOf('/'));
            if (parentPackage !== childPackage) return false;
        }
        const childParameters = child.descriptor.slice(0, child.descriptor.indexOf(')') + 1);
        const parentParameters = parent.descriptor.slice(0, parent.descriptor.indexOf(')') + 1);
        if (childParameters !== parentParameters) return false;
        const childReturn = child.descriptor.slice(childParameters.length);
        const parentReturn = parent.descriptor.slice(parentParameters.length);
        if (childReturn === parentReturn) return true;
        if (parentReturn === 'Ljava/lang/Object;' && (childReturn.startsWith('L') || childReturn.startsWith('['))) return true;
        if (childReturn.startsWith('[') && parentReturn.startsWith('[')) {
            return this.returnSubtype(childReturn.slice(1), parentReturn.slice(1));
        }
        return this.returnSubtype(childReturn, parentReturn);
    }

    private returnSubtype(child: string, parent: string): boolean {
        if (child === parent) return true;
        if (!child.startsWith('L') || !parent.startsWith('L')) return false;
        return this.ancestorNames(child.slice(1, -1) as ClassName).has(parent.slice(1, -1) as ClassName);
    }

    private visibleMethod(method: MethodDeclaration): MethodDeclaration | undefined {
        if ((method.access & (BRIDGE | SYNTHETIC)) === 0) return method;
        const target = method.bridgeTarget;
        return (this.methods.get(method.className) ?? []).find(candidate =>
            `${candidate.className}:${candidate.name}:${candidate.descriptor}` === target
            && (candidate.access & (BRIDGE | SYNTHETIC)) === 0
        );
    }

    isInterfaceClass(className: ClassName): boolean {
        return isInterface(this.classes.get(className)?.accessFlags ?? 0);
    }

    isAbstractDeclaration(target: HierarchyTarget): boolean {
        if (target.type === 'class') {
            return isAbstract(this.classes.get(target.className)?.accessFlags ?? 0);
        }
        const method = this.methods.get(target.className)?.find(candidate =>
            candidate.name === target.name && candidate.descriptor === target.descriptor
        );
        return isAbstract(method?.access ?? 0);
    }

    relations(token: Token): HierarchyRelations {
        if (!token.declaration) return { parents: [], children: [] };
        if (token.type === 'class') {
            return {
                parents: this.parentNames(token.className).map(className => ({ className, type: 'class' })),
                children: (this.children.get(token.className) ?? []).map(className => ({ className, type: 'class' }))
            };
        }
        if (token.type !== 'method') return { parents: [], children: [] };
        const ownMethods = this.methods.get(token.className) ?? [];
        const method = ownMethods.find(candidate => candidate.name === token.name && candidate.descriptor === token.descriptor);
        if (!method) return { parents: [], children: [] };
        const variants = ownMethods.filter(candidate => this.visibleMethod(candidate) === method);
        const parents: HierarchyTarget[] = [];
        for (const ancestor of this.ancestorNames(token.className)) {
            for (const parent of this.methods.get(ancestor) ?? []) {
                if (variants.some(child => this.overrides(child, parent))) {
                    const visible = this.visibleMethod(parent);
                    if (visible) parents.push(visible);
                }
            }
        }
        const children: HierarchyTarget[] = [];
        for (const child of this.methodsByName.get(method.name) ?? []) {
            if (!this.ancestorNames(child.className).has(token.className)) continue;
            if (this.overrides(child, method)) {
                const visible = this.visibleMethod(child);
                if (visible) children.push(visible);
            }
        }
        return { parents: this.uniqueTargets(parents), children: this.uniqueTargets(children) };
    }

    private uniqueTargets(targets: HierarchyTarget[]): HierarchyTarget[] {
        const unique = new Map<string, HierarchyTarget>();
        for (const target of targets) {
            unique.set(`${target.className}:${target.name}:${target.descriptor}`, target);
        }
        return [...unique.values()].sort((left, right) => left.className.localeCompare(right.className));
    }
}
