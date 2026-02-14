import { expect, Page } from '@playwright/test';

export async function waitForDecompiledContent(page: Page, expectedText: string) {
    await expect(async () => {
        const decompiling = page.getByText('Decompiling...');
        await expect(decompiling).toBeHidden();
    }).toPass({ timeout: 30000 });

    const editor = page.getByRole("code").nth(0);
    await expect(editor).toContainText(expectedText, { timeout: 30000 });
}

export async function setupTest(page: Page) {
    await page.addInitScript(() => {
        localStorage.setItem('setting_eula', 'true');
    });

    await page.goto('/');
}

export async function waitForIndexing(page: Page) {
    const downloading = page.getByText('Downloading Minecraft Jar');
    await downloading.waitFor();
    await downloading.waitFor({ state: 'hidden', timeout: 300000 });

    const indexing = page.getByText('Indexing Minecraft Jar');
    await indexing.waitFor();
    await indexing.waitFor({ state: 'hidden' });
}
