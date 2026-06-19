import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest, selectMinecraftVersion } from './test-utils';

test.describe('Version Switching', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Switches between Minecraft versions', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        await selectMinecraftVersion(page, '26.1-mock-2');

        await page.waitForTimeout(2000);

        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const editor = page.getByRole('code').first();
        await expect(editor).toBeVisible();
    });

    test('Preserves file when switching versions', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('LevelRenderer');

        const searchResult = page.getByText('net/minecraft/client/renderer/LevelRenderer', { exact: true });
        await searchResult.click();

        await waitForDecompiledContent(page, 'class LevelRenderer');

        await selectMinecraftVersion(page, '26.1-mock-2');

        await page.waitForTimeout(2000);

        await waitForDecompiledContent(page, 'class LevelRenderer');
    });
});
