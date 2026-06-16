import { BehaviorSubject, combineLatest, distinctUntilChanged, map, of, shareReplay, switchMap } from "rxjs";
import { jarIndex, type ClassData } from "../workers/jar-index/client";
import { minecraftJar } from "./MinecraftApi";
import { classNameFromClassFilePath, isClassFilePath, type ClassName } from "../utils/Names";

export class ClassNode {
    readonly name: ClassName;
    parents: ClassNode[] = [];
    children: ClassNode[] = [];
    classData: ClassData | null = null;

    constructor(name: ClassName) {
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
    private readonly index = new Map<ClassName, ClassNode>();

    addClass(className: ClassName): ClassNode {
        let node = this.index.get(className);
        if (!node) {
            node = new ClassNode(className);
            this.index.set(className, node);
        }
        return node;
    }

    addParentChildLink(parentName: ClassName, childName: ClassName): void {
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

    addChildParentLink(childName: ClassName, parentName: ClassName): void {
        this.addParentChildLink(parentName, childName);
    }
}



export const selectedInheritanceClassName = new BehaviorSubject<ClassName | null>(null);

export const inheritanceIndex = combineLatest([jarIndex, minecraftJar]).pipe(
    distinctUntilChanged(),
    switchMap(async ([jarIndexInstance, jarInstance]) => {
        const index = new InheritanceIndex();

        const classDataArray = await jarIndexInstance.getClassData();

        const classNames = new Set(
            Object.keys(jarInstance.jar.entries)
                .filter(isClassFilePath)
                .map(classNameFromClassFilePath)
        );

        for (const classData of classDataArray) {
            if (!classNames.has(classData.className)) {
                continue;
            }

            const node = index.addClass(classData.className);
            node.classData = classData;

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
