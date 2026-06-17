import {jarIndex} from "../workers/jar-index/client.ts";
import {firstValueFrom, from, map, switchMap} from "rxjs";
import type {MemberData} from "../workers/jar-index/types.ts";
import type {Token} from "./Tokens.ts";
import {type ClassNode, inheritanceIndex} from "./Inheritance.ts";

const memberDataResults = jarIndex.pipe(
    switchMap(index => from(parseMemberData(index.getMemberData())))
);

async function parseMemberData(memberData: Promise<MemberData[]>) {
    let map = new Map<string, MemberData>();
    for (let memberDataEntry of await memberData) {
        map.set(memberDataEntry.className, memberDataEntry);
    }
    return map;
}

function getClassNode(className: string) : Promise<ClassNode> {
    let classNode = inheritanceIndex.pipe(map(index => index.addClass(className)));
    return firstValueFrom(classNode);
}

export async function findDeclaration(token : Token) {
    if ("descriptor" in token) {
        const memberData = await firstValueFrom(memberDataResults);
        let classNode = await getClassNode(token.className);
        if (classHasMember(memberData, token.className, token.name, token.descriptor, token.type)) {
            return token.className;
        }
        for (let node of getAllAncestors(classNode)) {
            if (classHasMember(memberData, node.name, token.name, token.descriptor, token.type)) {
                return node.name;
            }
        }
    }
    return token.className;
}

function getAllAncestors(node: ClassNode) : ClassNode[] {
    const ancestors : ClassNode[] = [];
    const visited = new Set<ClassNode>();

    function walk(node: ClassNode) {
        for (const parent of node.parents) {
            if (visited.has(parent)) continue;
            visited.add(parent);
            ancestors.push(parent);
            walk(parent);
        }
    }
    walk(node);
    return ancestors;
}

function classHasMember(memberData: Map<string, MemberData>, className: string, memberName: string, memberDescriptor : string, memberType: "field" | "method") : boolean {
    let classMemberData = memberData.get(className);
    if (classMemberData) {
        let members = memberType === "field" ? classMemberData.fields : classMemberData.methods;
        for (let member of members) {
            let parts = member.split(":");
            if (parts[1] === memberName && parts[2] === memberDescriptor) {
                return true;
            }
        }
    }
    return false;
}
