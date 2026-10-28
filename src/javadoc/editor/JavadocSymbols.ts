import type { MemberToken } from '../../logic/Tokens';
import type { DecompileResult } from '../../workers/decompile/types';
import type { ClassData, JarIndex } from '../../workers/jar-index/client';
import type { MemberData } from '../../workers/jar-index/types';
import { toClassName, type ClassName } from '../../utils/Names';

const PRIVATE = 0x0002;
const PUBLIC_OR_PROTECTED = 0x0005;
const BRIDGE_OR_SYNTHETIC = 0x1040;

export interface InheritedMember {
    member: MemberToken;
    inherited: boolean;
}

export function sourceName(className: ClassName): string {
    return className.replaceAll('/', '.').replaceAll('$', '.');
}

function packageName(className: ClassName): string {
    return className.slice(0, className.lastIndexOf('/') + 1);
}

export function simpleName(className: ClassName): string {
    return sourceName(className).split('.').pop()!;
}

function getEnclosingClasses(owner: ClassName): ClassName[] {
    const classes = [owner];
    let separator = owner.lastIndexOf('$');
    while (separator >= 0) {
        owner = toClassName(owner.slice(0, separator));
        classes.push(owner);
        separator = owner.lastIndexOf('$');
    }
    return classes;
}

/** Resolves documentation references against source declarations and the loaded JAR index. */
export class JavadocSymbols {
    readonly classNames = new Set<ClassName>();
    private readonly classes = new Map<ClassName, ClassData>();
    private readonly members = new Map<ClassName, MemberToken[]>();
    private readonly access = new Map<string, number>();
    private readonly imports = new Set<string>();
    private readonly wildcardImports = new Set<string>();
    private readonly aliases = new Map<string, { className: ClassName; rank: number }[]>();
    readonly owner: ClassName;
    private readonly enclosingClasses: ClassName[];
    readonly ready: Promise<void>;

    constructor(
        result: DecompileResult,
        owner: ClassName,
        index: JarIndex | undefined,
    ) {
        this.owner = owner;
        this.enclosingClasses = getEnclosingClasses(owner);
        this.classNames.add(owner);
        this.addSourceDeclarations(result);
        this.readImports(result.source);
        this.ready = this.loadIndex(index);
    }

    classRank(className: ClassName): number {
        for (const enclosing of this.enclosingClasses) {
            if (className === enclosing || className.startsWith(`${enclosing}$`)) {
                return 0;
            }
        }
        if (this.imports.has(sourceName(className))) {
            return 1;
        }
        if (packageName(className) === packageName(this.owner)) {
            return 2;
        }
        const classPackage = packageName(className).replaceAll('/', '.').replace(/\.$/, '');
        if (classPackage === 'java.lang' || this.wildcardImports.has(classPackage)) {
            return 3;
        }
        return 4;
    }

    resolveClass(reference: string): ClassName | undefined {
        const candidates = this.aliases.get(reference);
        if (!candidates?.length) {
            return undefined;
        }
        if (candidates.length > 1 && candidates[0].rank === candidates[1].rank) {
            return undefined;
        }
        return candidates[0].className;
    }

    referenceName(className: ClassName): string {
        const shortName = this.shortReferenceName(className);
        return this.resolveClass(shortName) === className ? shortName : sourceName(className);
    }

    getMembers(className: ClassName): InheritedMember[] {
        const members: InheritedMember[] = [];
        const visited = new Set<ClassName>();
        const signatures = new Set<string>();
        const pending = [className];
        for (let index = 0; index < pending.length; index++) {
            const owner = pending[index];
            if (visited.has(owner)) {
                continue;
            }
            visited.add(owner);
            for (const member of this.members.get(owner) ?? []) {
                const inherited = owner !== className;
                if (member.name === '<clinit>' || (inherited && member.name === '<init>')) {
                    continue;
                }
                if (inherited && !this.isInheritedMemberVisible(member, className)) {
                    continue;
                }
                const signature = member.type === 'method' ? member.descriptor.split(')')[0] : '';
                const key = `${member.type}:${member.name}:${signature}`;
                if (signatures.has(key)) {
                    continue;
                }
                signatures.add(key);
                members.push({ member, inherited });
            }
            const data = this.classes.get(owner);
            if (data?.superName) {
                pending.push(data.superName);
            }
            if (data) {
                pending.push(...data.interfaces);
            }
        }
        return members;
    }

    private addSourceDeclarations(result: DecompileResult): void {
        for (const token of result.tokens) {
            this.classNames.add(token.className);
            if (token.type === 'method' || token.type === 'field') {
                this.addDescriptorClasses(token.descriptor);
            }
            if (token.declaration && (token.type === 'method' || token.type === 'field')) {
                const members = this.members.get(token.className) ?? [];
                members.push(token);
                this.members.set(token.className, members);
            }
        }
    }

    private readImports(source: string): void {
        for (const match of source.matchAll(/^\s*import\s+(?!static\b)([^\s;]+)\s*;/gm)) {
            if (match[1].endsWith('.*')) {
                this.wildcardImports.add(match[1].slice(0, -2));
            } else {
                this.imports.add(match[1].replaceAll('$', '.'));
            }
        }
    }

    private async loadIndex(index: JarIndex | undefined): Promise<void> {
        if (index) {
            try {
                const [classes, members] = await Promise.all([index.getClassData(), index.getMemberData()]);
                for (const data of classes) {
                    this.classNames.add(data.className);
                    this.classes.set(data.className, data);
                }
                for (const data of members) {
                    this.addMembers(data);
                }
            } catch (error) {
                console.warn('Unable to load Javadoc completion index; using source declarations', error);
            }
        }
        this.addImportedClasses();
        this.buildAliases();
    }

    private addImportedClasses(): void {
        for (const imported of this.imports) {
            if (![...this.classNames].some(className => sourceName(className) === imported)) {
                this.classNames.add(toClassName(imported.replaceAll('.', '/')));
            }
        }
    }

    private buildAliases(): void {
        for (const className of this.classNames) {
            const aliases = new Set([sourceName(className), className.replaceAll('/', '.'), this.shortReferenceName(className)]);
            for (const alias of aliases) {
                const candidates = this.aliases.get(alias) ?? [];
                candidates.push({ className, rank: this.classRank(className) });
                candidates.sort((left, right) => left.rank - right.rank);
                this.aliases.set(alias, candidates);
            }
        }
    }

    private addMembers(data: MemberData): void {
        this.classNames.add(data.className);
        const members: MemberToken[] = [];
        for (const key of [...data.methods, ...data.fields]) {
            const [, name, descriptor] = key.split(':');
            const type = descriptor.startsWith('(') ? 'method' : 'field';
            const access = data.methodAccess[key];
            if (name === '<clinit>' || (access !== undefined && (access & BRIDGE_OR_SYNTHETIC) !== 0)) {
                continue;
            }
            members.push({ type, className: data.className, name, descriptor, declaration: true, start: 0, length: 0 });
            if (access !== undefined) {
                this.access.set(key, access);
            }
            this.addDescriptorClasses(descriptor);
        }
        this.members.set(data.className, members);
    }

    private addDescriptorClasses(descriptor: string): void {
        for (const match of descriptor.matchAll(/L([^;]+);/g)) {
            this.classNames.add(toClassName(match[1]));
        }
    }

    private shortReferenceName(className: ClassName): string {
        const fullName = sourceName(className);
        if (this.imports.has(fullName)) {
            return simpleName(className);
        }
        for (const enclosing of this.enclosingClasses) {
            if (className === enclosing) {
                return simpleName(className);
            }
            if (className.startsWith(`${enclosing}$`)) {
                return sourceName(toClassName(className.slice(enclosing.length + 1)));
            }
        }
        const classPackage = packageName(className).replaceAll('/', '.').replace(/\.$/, '');
        if (classPackage === packageName(this.owner).replaceAll('/', '.').replace(/\.$/, '')
            || classPackage === 'java.lang' || this.wildcardImports.has(classPackage)) {
            return sourceName(toClassName(className.slice(packageName(className).length)));
        }
        return fullName;
    }

    private isInheritedMemberVisible(member: MemberToken, className: ClassName): boolean {
        const access = this.access.get(`${member.className}:${member.name}:${member.descriptor}`);
        if (access === undefined) {
            return true;
        }
        if ((access & PRIVATE) !== 0) {
            return false;
        }
        return (access & PUBLIC_OR_PROTECTED) !== 0 || packageName(member.className) === packageName(className);
    }
}
