import type { editor } from "monaco-editor";
import type { MinecraftJar } from "../logic/MinecraftApi";
import { getUriDecompilationResult } from "./CodeExtensions";
import { findTokenAtEditorPosition } from "./CodeUtils";

export const IS_DEFINITION_CONTEXT_KEY_NAME = "is_definition";

async function setClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

export function createCopyAwAction(
    jar: MinecraftJar,
    classListRef: { current: string[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_aw',
        label: 'Copy Class Tweaker / Access Widener',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const model = editor.getModel();
            if (!model) return;
            const result = await getUriDecompilationResult(jar, model.uri);

            const token = findTokenAtEditorPosition(result, editor, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for Class Tweaker entry.");
                return;
            }

            switch (token.type) {
                case "class":
                    await setClipboard(`accessible class ${token.className}`);
                    break;
                case "field":
                    await setClipboard(`accessible field ${token.className} ${token.name} ${token.descriptor}`);
                    break;
                case "method":
                    await setClipboard(`accessible method ${token.className} ${token.name} ${token.descriptor}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }

            messageApi.success("Copied Class Tweaker entry to clipboard.");
        }
    };
}

export function createCopyMixinAction(
    jar: MinecraftJar,
    classListRef: { current: string[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_mixin',
        label: 'Copy Mixin Target',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const model = editor.getModel();
            if (!model) return;
            const result = await getUriDecompilationResult(jar, model.uri);

            const token = findTokenAtEditorPosition(result, editor, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for Mixin target.");
                return;
            }

            switch (token.type) {
                case "class":
                    await setClipboard(`${token.className}`);
                    break;
                case "field":
                    await setClipboard(`L${token.className};${token.name}:${token.descriptor}`);
                    break;
                case "method":
                    await setClipboard(`L${token.className};${token.name}${token.descriptor}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }

            messageApi.success("Copied Mixin target to clipboard.");
        }
    };
}

export function createFindUsagesAction(
    jar: MinecraftJar,
    classListRef: { current: string[] | undefined; },
    messageApi: { error: (msg: string) => void; },
    usageQueryNext: (value: string) => void
) {
    return {
        id: 'find_usages',
        label: 'Find Usages',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const model = editor.getModel();
            if (!model) return;
            const result = await getUriDecompilationResult(jar, model.uri);

            const token = findTokenAtEditorPosition(result, editor, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for usages.");
                return;
            }

            switch (token.type) {
                case "class":
                    usageQueryNext(token.className);
                    break;
                case "field":
                    usageQueryNext(`${token.className}:${token.name}:${token.descriptor}`);
                    break;
                case "method":
                    usageQueryNext(`${token.className}:${token.name}:${token.descriptor}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }
        }
    };
}

export function createViewInheritanceAction(
    jar: MinecraftJar,
    messageApi: { error: (msg: string) => void; },
    selectedInheritanceClassNameNext: (value: string) => void
) {
    return {
        id: 'view_inheritance',
        label: 'View Inheritance Hierarchy',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const model = editor.getModel();
            if (!model) return;
            const result = await getUriDecompilationResult(jar, model.uri);

            const className = result.className.replace('.class', '');
            console.log(`Viewing inheritance for ${className}`);
            selectedInheritanceClassNameNext(className);
        }
    };
}
