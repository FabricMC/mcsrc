// These make each string type distinct at compile time, without changing the runtime type.
declare const classNameBrand: unique symbol;
declare const dottedClassNameBrand: unique symbol;
declare const classFilePathBrand: unique symbol;
declare const jarEntryPathBrand: unique symbol;

export type JarEntryPath = string & { readonly [jarEntryPathBrand]: "JarEntryPath"; };
// Examples: net/minecraft/ChatFormatting, net/minecraft/world/level/Level$ExplosionInteraction
export type ClassName = string & { readonly [classNameBrand]: "ClassName"; };
// Examples: net.minecraft.ChatFormatting, net.minecraft.world.level.Level$ExplosionInteraction
export type DottedClassName = string & { readonly [dottedClassNameBrand]: "DottedClassName"; };
// Examples: net/minecraft/ChatFormatting.class, net/minecraft/world/level/Level$ExplosionInteraction.class
export type ClassFilePath = `${string}.class` & JarEntryPath & { readonly [classFilePathBrand]: "ClassFilePath"; };

// net/minecraft/ChatFormatting.class -> net/minecraft/ChatFormatting
export function toClassName(value: string): ClassName {
    return value.replace(/\.class$/, "") as ClassName;
}

// net.minecraft.ChatFormatting -> net/minecraft/ChatFormatting
export function classNameFromDottedClassName(value: DottedClassName | string): ClassName {
    return value.replaceAll(".", "/") as ClassName;
}

// net.minecraft.ChatFormatting -> net.minecraft.ChatFormatting
export function toDottedClassName(value: string): DottedClassName {
    return value as DottedClassName;
}

// net/minecraft/ChatFormatting -> net.minecraft.ChatFormatting
export function dottedClassNameFromClassName(value: ClassName): DottedClassName {
    return value.replaceAll("/", ".") as DottedClassName;
}

// net.minecraft.world.level.Level$ExplosionInteraction -> Level$ExplosionInteraction
export function simpleDottedClassName(value: DottedClassName): string {
    return value.split(".").pop() || value;
}

// net/minecraft/ChatFormatting -> net/minecraft/ChatFormatting.class
export function toClassFilePath(value: ClassName | string): ClassFilePath {
    return (value.endsWith(".class") ? value : `${value}.class`) as ClassFilePath;
}

// assets/minecraft/lang/en_us.json -> assets/minecraft/lang/en_us.json
export function toJarEntryPath(value: string): JarEntryPath {
    return value as JarEntryPath;
}

// net/minecraft/world/level/Level$ExplosionInteraction.class -> net/minecraft/world/level/Level$ExplosionInteraction
export function classNameFromClassFilePath(path: ClassFilePath): ClassName {
    return path.slice(0, -".class".length) as ClassName;
}

// true for net/minecraft/ChatFormatting.class, false for assets/minecraft/lang/en_us.json
export function isClassFilePath(path: string): path is ClassFilePath {
    return path.endsWith(".class");
}

// net/minecraft/ChatFormatting.class -> net/minecraft/ChatFormatting
export function withoutClassExtension(path: ClassFilePath | string): string {
    return path.replace(/\.class$/, "");
}

// net/minecraft/world/level/Level$ExplosionInteraction -> net/minecraft/world/level/Level
export function outerClassName(className: ClassName): ClassName {
    return className.split("$")[0] as ClassName;
}

// net/minecraft/world/level/Level$ExplosionInteraction.class -> net/minecraft/world/level/Level.class
export function outerClassFilePath(path: ClassFilePath): ClassFilePath {
    return toClassFilePath(outerClassName(classNameFromClassFilePath(path)));
}
