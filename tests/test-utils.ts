import { expect, Page } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function waitForDecompiledContent(page: Page, expectedText: string) {
  await expect(async () => {
    const decompiling = page.getByText("Decompiling...");
    await expect(decompiling).toBeHidden();
  }).toPass();

  const editor = page.getByRole("code").nth(0);
  await expect(editor).toContainText(expectedText);
}

async function setupNetworkMocking(page: Page) {
  const testVersions = {
    versions: [
      {
        id: "26.1-mock-3",
        type: "snapshot",
        url: "http://localhost:4173/test-data/dummy3-manifest.json",
        releaseTime: "2026-02-11T09:31:23+00:00",
      },
      {
        id: "26.1-mock-2",
        type: "snapshot",
        url: "http://localhost:4173/test-data/dummy2-manifest.json",
        releaseTime: "2026-02-03T12:46:52+00:00",
      },
      {
        id: "26.1-mock-1",
        type: "snapshot",
        url: "http://localhost:4173/test-data/dummy1-manifest.json",
        releaseTime: "2026-01-13T12:47:34+00:00",
      },
    ],
  };

  await page.route(
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(testVersions),
      });
    },
  );

  for (let i = 1; i <= 3; i++) {
    await page.route(`http://localhost:4173/test-data/dummy${i}-manifest.json`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: `26.1-mock-${i}`,
          downloads: {
            client: {
              url: `http://localhost:4173/test-data/dummy${i}.jar`,
            },
          },
        }),
      });
    });

    await page.route(`http://localhost:4173/test-data/dummy${i}.jar`, async (route) => {
      const jarPath = path.join(__dirname, `../java/build/libs/dummy${i}.jar`);
      const jarBuffer = fs.readFileSync(jarPath);
      await route.fulfill({
        status: 200,
        contentType: "application/java-archive",
        body: jarBuffer,
      });
    });
  }
}

export async function setupTest(page: Page) {
  await setupNetworkMocking(page);
  await page.addInitScript(() => {
    localStorage.setItem("setting_eula", "true");
  });
}
