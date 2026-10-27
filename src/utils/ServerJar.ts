import { readBlob } from "@katana-project/zip";
import { toArrayBuffer } from "./ArrayBuffer";

export async function unwrapServerJar(blob: Blob): Promise<Blob> {
    const zip = await readBlob(blob, { naive: true });
    const versionsList = zip.entries.find(entry => entry.name === "META-INF/versions.list");
    if (!versionsList) {
        return blob;
    }

    // Bundled servers list the actual Minecraft jar separately from their libraries.
    const versionsText = new TextDecoder().decode(await versionsList.bytes());
    const versionEntries = versionsText.trim().split(/\r?\n/);
    if (versionEntries.length !== 1) {
        throw new Error("Expected one Minecraft jar in the server bundle");
    }

    const jarPath = versionEntries[0].split("\t")[2];
    const serverJar = zip.entries.find(entry => entry.name === `META-INF/versions/${jarPath}`);
    if (!jarPath || !serverJar) {
        throw new Error("Minecraft jar is missing from the server bundle");
    }

    return new Blob([toArrayBuffer(await serverJar.bytes())]);
}
