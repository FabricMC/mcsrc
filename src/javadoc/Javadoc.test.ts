import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Token } from "../logic/Tokens";

const storage = vi.hoisted(() => ({
    current: null as string | null,
    getStoredJavadoc: vi.fn(() => storage.current),
    setStoredJavadoc: vi.fn((_kind, _owner, _name, _descriptor, comment: string | null) => {
        storage.current = comment;
    }),
    writeJavadocSource: vi.fn(),
}));

vi.mock("./JavadocStorage", () => storage);

import {
    activeJavadocFile,
    activeJavadocToken,
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
});
