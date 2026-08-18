import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Token } from "../logic/Tokens";

const storage = vi.hoisted(() => ({
    current: null as string | null,
    JavadocElementKind: { Class: 0, Field: 1, Method: 2 },
    getStoredJavadoc: vi.fn(() => storage.current),
    setStoredJavadoc: vi.fn((_kind, _owner, _name, _descriptor, comment: string | null) => {
        storage.current = comment;
    }),
    writeJavadocSource: vi.fn(),
}));
const settings = vi.hoisted(() => ({ bytecode: { value: true } }));

vi.mock("./JavadocStorage", () => storage);
vi.mock("../logic/Settings", () => settings);

import {
    activeJavadocFile,
    activeJavadocToken,
    activateJavadocFile,
    deactivateJavadocFile,
    javadocRevision,
    saveTokenJavadoc,
} from "./Javadoc";

const token = {
    type: "class",
    className: "example/Owner",
} as Token;

describe("saveTokenJavadoc", () => {
    beforeEach(() => {
        storage.current = "Existing docs";
        storage.getStoredJavadoc.mockClear();
        storage.setStoredJavadoc.mockClear();
        storage.writeJavadocSource.mockReset();
        activeJavadocFile.next({
            kind: "file",
            handle: { name: "docs.mapping" } as FileSystemFileHandle,
            format: "enigma",
        });
    });

    it("does not write an unchanged value", async () => {
        await saveTokenJavadoc(token, "Existing docs");

        expect(storage.setStoredJavadoc).not.toHaveBeenCalled();
        expect(storage.writeJavadocSource).not.toHaveBeenCalled();
    });

    it("restores the previous value and revision after a failed write", async () => {
        const revision = javadocRevision.value;
        storage.writeJavadocSource.mockRejectedValue(new Error("write failed"));

        await expect(saveTokenJavadoc(token, "New docs")).rejects.toThrow("write failed");

        expect(storage.current).toBe("Existing docs");
        expect(javadocRevision.value).toBe(revision);
    });

    it("clears the active file and editor token when Javadoc mode is deactivated", () => {
        activeJavadocToken.next(token);

        deactivateJavadocFile();

        expect(activeJavadocFile.value).toBeNull();
        expect(activeJavadocToken.value).toBeNull();
    });

    it("leaves bytecode mode when Javadoc mappings are activated", () => {
        settings.bytecode.value = true;
        const file = {
            kind: "file",
            handle: { name: "docs.mapping" } as FileSystemFileHandle,
            format: "enigma",
        } as const;

        activateJavadocFile(file);

        expect(settings.bytecode.value).toBe(false);
        expect(activeJavadocFile.value).toBe(file);
    });
});
