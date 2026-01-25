import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Version Switching', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Switches between Minecraft versions', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const versionSelect = page.locator('.ant-select').first();
        await versionSelect.click();
        await page.waitForTimeout(500);

        const versionOptions = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
        const firstVersion = versionOptions.nth(1);
        await firstVersion.click();

        await page.waitForTimeout(2000);

        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const editor = page.getByRole('code').first();
        await expect(editor).toBeVisible();
    });

    test('Preserves file when switching versions', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('Minecraft');

        const searchResult = page.getByText('net/minecraft/client/Minecraft', { exact: true });
        await searchResult.click();

        await waitForDecompiledContent(page, 'class Minecraft');

        const versionSelect = page.locator('.ant-select').first();
        await versionSelect.click();
        await page.waitForTimeout(500);

        const versionOptions = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
        const firstVersion = versionOptions.nth(1);
        await firstVersion.click();

        await page.waitForTimeout(2000);

        await waitForDecompiledContent(page, 'class Minecraft');
    });
});
