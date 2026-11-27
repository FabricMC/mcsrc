import type { editor } from "monaco-editor";
import { findTokenAtPosition } from './CodeUtils';
import type { DecompileResult } from "../workers/decompile/types";
import { openInheritanceViewTab } from "../logic/tabs";
import { dottedClassNameFromClassName, dollarToDottedClassName, type ClassFilePath, type ClassName } from "../utils/Names";
import type { ReferenceKey } from "../workers/jar-index/types";
import { supportsPermalinking } from "../logic/Settings";
import { firstValueFrom } from "rxjs";
import { selectedMinecraftVersion } from "../logic/State";
import { symbolPermalink } from "../logic/Permalink";
import { parseMethodDescriptor } from "../utils/JavaDescriptors";

export const IS_DEFINITION_CONTEXT_KEY_NAME = "is_definition";
const IS_METHOD_CONTEXT_KEY_NAME = "is_method_symbol";
const IS_FIELD_CONTEXT_KEY_NAME = "is_field_symbol";

export function installSymbolContextKeys(
    codeEditor: editor.IStandaloneCodeEditor,
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; }
): () => void {
    const methodContext = codeEditor.createContextKey<boolean>(IS_METHOD_CONTEXT_KEY_NAME, false);
    const fieldContext = codeEditor.createContextKey<boolean>(IS_FIELD_CONTEXT_KEY_NAME, false);
    const update = () => {
        const token = findTokenAtPosition(codeEditor, decompileResultRef.current, classListRef.current);
        methodContext.set(token?.type === 'method');
        fieldContext.set(token?.type === 'field');
    };
    update();
    const cursor = codeEditor.onDidChangeCursorPosition(update);
    return () => {
        cursor.dispose();
        methodContext.reset();
        fieldContext.reset();
    };
}

async function setClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

export function createCopyPermalinkAction(
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_permalink',
        label: 'Copy Permalink',
        contextMenuGroupId: '9_cutcopypaste',
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const position = editor.getPosition();
            if (!position) {
                messageApi.error("Failed to get cursor position.");
                return;
            }

            if (!await firstValueFrom(supportsPermalinking)) {
                messageApi.error("Permalinks are not supported in this environment.");
                return;
            }

            const urlWithoutHash = window.location.origin + window.location.pathname + window.location.search;

            await setClipboard(urlWithoutHash + "#L" + position.lineNumber);

            messageApi.success("Copied Permalink to clipboard.");
        }
    };
}

export function createCopySymbolPermalinkAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; },
    type: 'method' | 'field'
) {
    const memberName = type === 'method' ? 'Method' : 'Field';
    return {
        id: `copy_${type}_permalink`,
        label: `Copy Link to ${memberName}`,
        contextMenuGroupId: '9_cutcopypaste',
        precondition: type === 'method' ? IS_METHOD_CONTEXT_KEY_NAME : IS_FIELD_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor): Promise<void> {
            if (!await firstValueFrom(supportsPermalinking)) {
                messageApi.error("Permalinks are not supported in this environment.");
                return;
            }

            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
            if (!token || token.type !== type) {
                messageApi.error(`Place the cursor on a ${type}.`);
                return;
            }

            const version = selectedMinecraftVersion.value;
            if (!version) {
                messageApi.error("Select a Minecraft version before copying a symbol link.");
                return;
            }

            const symbol = token.type === 'method'
                ? { type: 'method' as const, name: token.name, parameterTypes: parseMethodDescriptor(token.descriptor).parameterTypes }
                : { type: 'field' as const, name: token.name };
            const link = window.location.origin + symbolPermalink(version, token.className, symbol);
            await setClipboard(link);
            messageApi.success(`Copied Link to ${memberName} to clipboard.`);
        }
    };
}

export function createCopyAwAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_aw',
        label: 'Copy Class Tweaker / Access Widener',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
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

export function createCopyAtAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_at',
        label: 'Copy Access Transformer',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for Access Transformer entry.");
                return;
            }

            switch (token.type) {
                case "class":
                    await setClipboard(`public ${dottedClassNameFromClassName(token.className)}`);
                    break;
                case "field":
                    await setClipboard(`public ${dottedClassNameFromClassName(token.className)} ${token.name}`);
                    break;
                case "method":
                    await setClipboard(`public ${dottedClassNameFromClassName(token.className)} ${token.name}${token.descriptor}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }

            messageApi.success("Copied Access Transformer entry to clipboard.");
        }
    };
}

export function createCopyMixinAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_mixin',
        label: 'Copy Mixin Target',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
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

export function createCopyQualifiedNameAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; }
) {
    return {
        id: 'copy_qualified_name',
        label: 'Copy Qualified Name',
        contextMenuGroupId: '9_cutcopypaste',
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for Qualified Name.");
                return;
            }

            switch (token.type) {
                case "class":
                    await setClipboard(`${dollarToDottedClassName(dottedClassNameFromClassName(token.className))}`);
                    break;
                case "field":
                    await setClipboard(`${dollarToDottedClassName(dottedClassNameFromClassName(token.className))}.${token.name}`);
                    break;
                case "method":
                    await setClipboard(`${dollarToDottedClassName(dottedClassNameFromClassName(token.className))}.${token.name}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }

            messageApi.success("Copied Qualified Name to clipboard.");
        }
    };
}

export function createFindAllReferencesAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; },
    referenceQueryNext: (value: ReferenceKey) => void
) {
    return {
        id: 'find_all_references',
        label: 'Find All References',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        precondition: IS_DEFINITION_CONTEXT_KEY_NAME,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
            if (!token) {
                messageApi.error("Failed to find token for references.");
                return;
            }

            switch (token.type) {
                case "class":
                    referenceQueryNext(token.className);
                    break;
                case "field":
                    referenceQueryNext(`${token.className}:${token.name}:${token.descriptor}`);
                    break;
                case "method":
                    referenceQueryNext(`${token.className}:${token.name}:${token.descriptor}`);
                    break;
                default:
                    messageApi.error("Token is not a class, field, or method.");
                    return;
            }
        }
    };
}

export function createViewInheritanceAction(
    decompileResultRef: { current: DecompileResult | undefined; },
    classListRef: { current: ClassFilePath[] | undefined; },
    messageApi: { error: (msg: string) => void; },
    selectedInheritanceClassNameNext: (value: ClassName) => void
) {
    return {
        id: 'view_inheritance',
        label: 'View Inheritance Hierarchy',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 2,
        run: async function (editor: editor.ICodeEditor, ...args: any[]): Promise<void> {
            if (!decompileResultRef.current) {
                messageApi.error("No decompile result available for inheritance view.");
                return;
            }

            let className: ClassName;

            const token = findTokenAtPosition(editor, decompileResultRef.current, classListRef.current);
            if (token && token.declaration && token.type === 'class') {
                className = token.className;
            } else {
                className = decompileResultRef.current.className;
            }

            console.log(`Viewing inheritance for ${className}`);
            openInheritanceViewTab(`hierarchy::${className}`);
        }
    };
}
