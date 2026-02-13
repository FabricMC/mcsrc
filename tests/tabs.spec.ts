import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Tabs', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Opens multiple tabs and switches between them', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('Minecraft');

        const searchResult = page.getByText('net/minecraft/client/Minecraft', { exact: true });
        await searchResult.click();
        await page.waitForTimeout(500);

        await waitForDecompiledContent(page, 'class Minecraft');

        const tabs = page.locator('.ant-tabs-tab');
        await expect(tabs).toHaveCount(2);

        const chatFormattingTab = tabs.filter({ hasText: 'ChatFormatting' });
        await chatFormattingTab.click();

        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });

    test('Closes tabs', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('Minecraft');

        const searchResult = page.getByText('net/minecraft/client/Minecraft', { exact: true });
        await searchResult.click();
        await page.waitForTimeout(500);

        await waitForDecompiledContent(page, 'class Minecraft');

        const tabs = page.locator('.ant-tabs-tab');
        await expect(tabs).toHaveCount(2);

        const closeButton = tabs.filter({ hasText: 'Minecraft' }).locator('.ant-tabs-tab-remove');
        await closeButton.click();

        await expect(tabs).toHaveCount(1);
        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });

    test('Closes other tabs via context menu', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });

        await searchBox.fill('Minecraft');
        await page.getByText('net/minecraft/client/Minecraft', { exact: true }).click();
        await page.waitForTimeout(500);
        await waitForDecompiledContent(page, 'class Minecraft');

        await searchBox.fill('SystemReport');
        await page.getByText('net/minecraft/SystemReport', { exact: true }).click();
        await page.waitForTimeout(500);
        await waitForDecompiledContent(page, 'class SystemReport');

        const tabs = page.locator('.ant-tabs-tab');
        await expect(tabs).toHaveCount(3);

        const minecraftTab = tabs.filter({ hasText: 'Minecraft' });
        await page.waitForTimeout(50);
        await minecraftTab.click({ button: 'right' });

        const closeOthersOption = page.getByText('Close Other Tabs');
        await page.waitForTimeout(50);
        await closeOthersOption.click();

        await expect(tabs).toHaveCount(1);
        await waitForDecompiledContent(page, 'class Minecraft');
    });
});
