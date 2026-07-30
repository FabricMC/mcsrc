import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Token } from "../logic/Tokens";
import type { ClassName } from "../utils/Names";

const storage = vi.hoisted(() => ({
    comment: null as string | null,
    get: vi.fn(),
    set: vi.fn(),
    write: vi.fn(),
}));

vi.mock("./JavadocStorage", () => ({
    getStoredJavadoc: storage.get,
    setStoredJavadoc: storage.set,
    writeJavadocFile: storage.write,
}));

import {
    activeJavadocFile,
    getJavadocForToken,
    javadocRevision,
    saveTokenJavadoc,
} from "./Javadoc";

const token: Token = {
    type: "method",
    className: "net/minecraft/Test" as ClassName,
    name: "run",
    descriptor: "()V",
    declaration: true,
    start: 0,
    length: 3,
};

describe("Javadoc", () => {
    beforeEach(() => {
        storage.comment = "Before";
        storage.get.mockReset().mockImplementation(() => storage.comment);
        storage.set.mockReset().mockImplementation((
            _kind: number,
            _owner: string,
            _name: string,
            _descriptor: string,
            comment: string | null,
        ) => {
            storage.comment = comment;
        });
        storage.write.mockReset().mockResolvedValue(undefined);
        activeJavadocFile.next({
            handle: {} as FileSystemFileHandle,
            format: "tiny2",
        });
        javadocRevision.next(0);
    });

    it("queries one element from the Java-backed tree", () => {
        expect(getJavadocForToken(token)).toBe("Before");
        expect(storage.get).toHaveBeenCalledWith(
            2,
            "net/minecraft/Test",
            "run",
            "()V",
        );
    });

    it("publishes a revision after the file is written", async () => {
        await saveTokenJavadoc(token, "After");

        expect(storage.comment).toBe("After");
        expect(storage.write).toHaveBeenCalledOnce();
        expect(javadocRevision.value).toBe(1);
    });

    it("rolls the tree back when the file write fails", async () => {
        storage.write.mockRejectedValue(new Error("write failed"));

        await expect(saveTokenJavadoc(token, "After")).rejects.toThrow("write failed");

        expect(storage.comment).toBe("Before");
        expect(javadocRevision.value).toBe(0);
    });
});
