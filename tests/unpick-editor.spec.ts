import { test } from "@playwright/test";
import { setupTest, waitForDecompiledContent } from "./test-utils";

test("updates the open Java source after editing an Unpick file", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The Annotater directory picker is a Chromium feature");
    await setupTest(page);
    await page.goto("/");

    await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        await root.getDirectoryHandle("mappings", { create: true });
        const definitions = await root.getDirectoryHandle("unpick", { create: true });
        const libraries = await root.getDirectoryHandle("libs", { create: true });

        const writeFile = async (directory: FileSystemDirectoryHandle, name: string, content: string | Blob) => {
            const file = await directory.getFileHandle(name, { create: true });
            const writer = await file.createWritable();
            await writer.write(content);
            await writer.close();
        };

        await writeFile(root, "config.json", JSON.stringify({
            version: "26.1-mock-1",
            mappings: "mappings",
            runtimeLibraries: "libs",
            unpickDefinitions: "unpick",
        }));
        await writeFile(definitions, "distance.unpick", "invalid\n");
        const runtimeJar = await fetch("/test-data/dummy2.jar");
        await writeFile(libraries, "runtime.jar", await runtimeJar.blob());

        Object.defineProperty(window, "showDirectoryPicker", { value: async () => root });
    });

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("menuitem", { name: "Tools" }).click();
    await page.getByTestId("annotater-directory").click();
    await page.getByRole("searchbox", { name: "Search classes" }).fill("LevelRenderer");
    await page.getByText("net/minecraft/client/renderer/LevelRenderer", { exact: true }).click();
    await waitForDecompiledContent(page, "return 12;");

    await page.getByRole("button", { name: "Unpick editor" }).click();
    const pane = page.getByRole("region", { name: "Unpick definitions" });
    await pane.locator(".view-lines").click();
    await page.keyboard.press("Control+a");
    await page.keyboard.insertText([
        "unpick v4",
        "group int distance",
        "    6 + 6",
        "target_method LevelR",
    ].join("\n"));
    const suggestions = page.locator(".suggest-widget.visible");
    await suggestions.getByText("LevelRenderer", { exact: true }).click();
    await page.keyboard.type(" getRenderD");
    await suggestions.getByText("getRenderDistance", { exact: true }).click();
    await page.keyboard.insertText("\n    return distance");

    await waitForDecompiledContent(page, "return 6 + 6;");
});
