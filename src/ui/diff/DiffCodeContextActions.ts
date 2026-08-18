import type { editor } from "monaco-editor";
import { supportsPermalinking } from "../../logic/Settings";
import { firstValueFrom } from "rxjs";

async function setClipboard(text: string): Promise<void> {
    await navigator.clipboard.writeText(text);
}

export function createCopyPermalinkAction(
    messageApi: { error: (msg: string) => void; success: (msg: string) => void; },
    editorSide: "left" | "right"
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

            if (editorSide === "left") {
                await setClipboard(urlWithoutHash + "#L" + position.lineNumber);
            } else {
                await setClipboard(urlWithoutHash + "#R" + position.lineNumber);
            }

            messageApi.success("Copied Permalink to clipboard.");
        }
    };
}