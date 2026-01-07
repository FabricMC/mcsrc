import { test, expect, Page } from '@playwright/test';

async function waitForDecompiledContent(page: Page, expectedText: string) {
    await expect(async () => {
        const decompiling = page.getByText('Decompiling...');
        await expect(decompiling).toBeHidden();
    }).toPass({ timeout: 30000 });

    const editor = page.getByRole("code").nth(0);
    await expect(editor).toContainText(expectedText, { timeout: 5000 });
}

test.describe('mcsrc', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            localStorage.setItem('setting_eula', 'true');
        });

        await page.goto('/');
    });

    test('Decompiles class', async ({ page }) => {
        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });

    test('Searches and decompiles Minecraft class', async ({ page }) => {
        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('Minecraft');

        const searchResult = page.getByText('net/minecraft/client/Minecraft', { exact: true });
        await searchResult.click();

        await waitForDecompiledContent(page, 'class Minecraft');
    });
});
