import { BehaviorSubject, distinctUntilChanged, from, map, of, shareReplay, switchMap } from "rxjs";
import { parseClassfile } from "../utils/Classfile";
import { minecraftJar, type MinecraftJar } from "./MinecraftApi";

export class ClassNode {
    readonly name: string;
    parents: ClassNode[] = [];
    children: ClassNode[] = [];

    constructor(name: string) {
        this.name = name;
    }

    getRoot(): ClassNode {
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

// Percent complete is total >= 0
export const inheritanceIndexProgress = new BehaviorSubject<number>(-1);

export async function buildInheritanceIndex(minecraftJar: MinecraftJar): Promise<InheritanceIndex> {
    const index = new InheritanceIndex();

    try {
        inheritanceIndexProgress.next(0);

        const jar = minecraftJar.jar;
        const classNames = Object.keys(jar.entries)
            .filter(name => name.endsWith(".class"));

        for (const className of classNames) {
            const entry = jar.entries[className];
            const data = await entry.bytes();
            const classInfo = parseClassfile(data);

            index.addClass(classInfo.name);

            if (classInfo.superName) {
                if (classNames.includes(classInfo.superName + ".class")) {
                    index.addChildParentLink(classInfo.name, classInfo.superName);
                }
            }

            for (const interfaceName of classInfo.interfaces) {
                if (!classNames.includes(interfaceName + ".class")) continue;
                index.addChildParentLink(classInfo.name, interfaceName);
            }

            inheritanceIndexProgress.next(Math.round((classNames.indexOf(className) / classNames.length) * 100));
        }
    } finally {
        inheritanceIndexProgress.next(-1);
    }

    return index;
}

export const selectedInheritanceClassName = new BehaviorSubject<string | null>(null);

export const inheritanceIndex = minecraftJar.pipe(
    distinctUntilChanged(),
    switchMap(minecraftJar => from(buildInheritanceIndex(minecraftJar))),
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