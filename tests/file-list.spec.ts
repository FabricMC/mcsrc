import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('File List Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Navigates to file via search', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('LevelRenderer');

        const searchResult = page.getByText('net/minecraft/client/renderer/LevelRenderer', { exact: true });
        await expect(searchResult).toBeVisible();

        await searchResult.click();
        await waitForDecompiledContent(page, 'class LevelRenderer');
    });

    test('Shows multiple search results', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('Renderer');

        const searchList = page.locator('.ant-list');
        await expect(searchList).toContainText('LevelRenderer');
    });

    test('Clears search and shows file tree', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('LevelRenderer');

        await page.waitForTimeout(500);

        await searchBox.clear();

        const fileTree = page.locator('.ant-tree').first();
        const netFolder = fileTree.getByText('net').first();
        await expect(netFolder).toBeVisible();
    });
});
