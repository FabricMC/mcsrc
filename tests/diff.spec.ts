import { test, expect } from '@playwright/test';
import { setupTest, selectMinecraftVersion } from './test-utils';

test.describe('Diff View', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Opens diff view and selects LevelRenderer', async ({ page }) => {
        await page.goto('/');

        await page.getByRole('button', { name: 'Compare' }).click();

        await expect(page.getByText('Select a file')).toBeVisible();

        await selectMinecraftVersion(page, '26.1-mock-1', 0);

        await selectMinecraftVersion(page, '26.1-mock-2', 1);

        const fileList = page.locator('.diff-file-list');
        await expect(fileList.locator('.diff-file-row').first()).toBeVisible();

        const searchInput = page.locator('input[placeholder="Search"]');
        await searchInput.fill('LevelRenderer');

        const firstFileRow = fileList.locator('.diff-file-row').first();
        await expect(firstFileRow).toBeVisible();
        await firstFileRow.click();

        await page.waitForTimeout(500);
        await expect(firstFileRow).toHaveClass(/diff-file-row-selected/);

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden();

        const editor = page.locator('.monaco-diff-editor');
        await expect(editor).toBeVisible();
        await expect(editor).toContainText('net.minecraft.client.renderer');
    });
});
