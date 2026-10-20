import type {ClassData, ClassDataString, Field, MemberData, Method} from "./types.ts";
import {type ClassName, toClassName} from "../../utils/Names.ts";

export function parseClassData(data: ClassDataString): ClassData {
    const [className, superName, accessFlagsStr, interfacesStr] = data.split("|");
    return {
        className: toClassName(className),
        superName: superName ? toClassName(superName) : "",
        accessFlags: parseInt(accessFlagsStr, 10),
        interfaces: interfacesStr ? interfacesStr.split(",").filter(i => i.length > 0).map(toClassName) : []
    };
}

export function parseMemberData(data: string): MemberData {
    let parts = data.split("|");
    return {
        className: parts[0] as ClassName,
        methods: parts[1] ? parts[1].split(",") as Method[] : [],
        fields: parts[2] ? parts[2].split(",") as Field[] : [],
        methodAccess: Object.fromEntries((parts[3] || "").split(",").filter(Boolean).map(value => {
            const separator = value.lastIndexOf(":");
            return [value.slice(0, separator), Number(value.slice(separator + 1))];
        })),
        methodBridges: Object.fromEntries((parts[4] || "").split(",").filter(Boolean).map(value => value.split("=")))
    }
}