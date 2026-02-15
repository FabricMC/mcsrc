import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, shareReplay, switchMap } from "rxjs";
import { jarIndex } from "../workers/JarIndex";
import { minecraftJar } from "./MinecraftApi";

export class ClassNode {
    readonly name: string;
    parents: ClassNode[] = [];
    children: ClassNode[] = [];
    accessFlags: number = 0;

    constructor(name: string) {
        this.name = name;
    }

    getRoot(): ClassNode {
        // oxlint-disable-next-line typescript/no-this-alias
        let n: ClassNode = this;

        while (n.parents.length > 0) {
            n = n.parents[0];
        }

        return n;
    }
}

export class InheritanceIndex {
    private readonly index = new Map<string, ClassNode>();

    addClass(className: string): ClassNode {
        let node = this.index.get(className);
        if (!node) {
            node = new ClassNode(className);
            this.index.set(className, node);
        }
        return node;
    }

    addParentChildLink(parentName: string, childName: string): void {
        const parent = this.addClass(parentName);
        const child = this.addClass(childName);

        // Add parent if not already present
        if (!child.parents.includes(parent)) {
            child.parents.push(parent);
        }

        // Add to children list if not already present
        if (!parent.children.includes(child)) {
            parent.children.push(child);
        }
    }

    addChildParentLink(childName: string, parentName: string): void {
        this.addParentChildLink(parentName, childName);
    }
}



export const selectedInheritanceClassName = new BehaviorSubject<string | null>(null);

export const inheritanceIndex = combineLatest([jarIndex, minecraftJar]).pipe(
    distinctUntilChanged(),
    switchMap(async ([jarIndexInstance, jarInstance]) => {
        const index = new InheritanceIndex();

        const classDataArray = await jarIndexInstance.getClassData();

        const classNames = new Set(
            Object.keys(jarInstance.jar.entries)
                .filter(name => name.endsWith(".class"))
                .map(name => name.slice(0, -6))
        );

        for (const classData of classDataArray) {
            if (!classNames.has(classData.className)) {
                continue;
            }

            const node = index.addClass(classData.className);
            node.accessFlags = classData.accessFlags;

            if (classData.superName && classData.superName.length > 0 && classNames.has(classData.superName)) {
                index.addChildParentLink(classData.className, classData.superName);
            }

            for (const interfaceName of classData.interfaces) {
                if (classNames.has(interfaceName)) {
                    index.addChildParentLink(classData.className, interfaceName);
                }
            }
        }

        return index;
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);

export const selectedInheritanceClassNode = selectedInheritanceClassName.pipe(
    switchMap(className => {
        if (className === null) {
            return of(null);
        }
        return inheritanceIndex.pipe(
            map(index => index.addClass(className))
        );
    }),
    shareReplay({ bufferSize: 1, refCount: false })
);