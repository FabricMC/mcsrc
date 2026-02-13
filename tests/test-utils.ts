import { expect, Page } from '@playwright/test';

export async function waitForDecompiledContent(page: Page, expectedText: string) {
    const decompiling = page.getByText('Decompiling...');
    await decompiling.waitFor({ state: 'hidden', timeout: 30000 });

    const editor = page.getByRole("code").nth(0);
    await expect(editor).toContainText(expectedText, { timeout: 30000 });
}

export async function setupTest(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('setting_eula', 'true');
    });

    await page.goto('/');

    const downloading = page.getByText('Downloading Minecraft Jar');
    await downloading.waitFor();
    await downloading.waitFor({ state: 'hidden', timeout: 300000 });
}

export async function waitForIndexing(page: Page) {
    const indexing = page.getByText('Indexing Minecraft Jar');
    await indexing.waitFor();
    await indexing.waitFor({ state: 'hidden' });
}
