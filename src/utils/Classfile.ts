export function isInterface(accessFlags: number): boolean {
    return (accessFlags & 0x0200) !== 0;
}

export function isAbstract(accessFlags: number): boolean {
    return (accessFlags & 0x0400) !== 0;
}
