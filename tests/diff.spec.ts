import { test, expect } from '@playwright/test';
import { setupTest } from './test-utils';

test.describe('Diff View', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Opens diff view and selects LevelRenderer', async ({ page }) => {
        await page.goto('/');

        const versionSelect = page.locator('.ant-select').first();
        await versionSelect.click();

        const compareOption = page.getByText('Compare', { exact: true });
        await compareOption.click();

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible();

        const fileListTable = page.locator('.ant-table-tbody');
        await expect(fileListTable.locator('tr').first()).toBeVisible();

        const leftVersionSelect = page.locator('.ant-select').nth(0);
        await leftVersionSelect.click();

        await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible();

        const leftOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '26.1-mock-1' }).first();
        await leftOption.click();

        const rightVersionSelect = page.locator('.ant-select').nth(1);
        await expect(rightVersionSelect).toBeVisible();
        await rightVersionSelect.click();

        await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible();

        const rightOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '26.1-mock-2' }).first();
        await rightOption.click();

        const searchInput = page.locator('input[placeholder="Search"]');
        await searchInput.fill('LevelRenderer');

        const firstFileRow = fileListTable.locator('tr').first();
        await expect(firstFileRow).toBeVisible();
        await firstFileRow.click();

        await page.waitForTimeout(500);
        await expect(firstFileRow).toHaveClass(/ant-table-row-selected/);

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden();

        const editor = page.locator('.monaco-diff-editor');
        await expect(editor).toContainText('net.minecraft.client.renderer');
    });
});
