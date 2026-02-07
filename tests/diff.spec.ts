import { test, expect } from '@playwright/test';
import { setupTest } from './test-utils';

test.describe('Diff View', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Opens diff view and selects LevelRenderer', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(1500);

        const versionSelect = page.locator('.ant-select').first();
        await versionSelect.click();
        await page.waitForTimeout(500);

        const compareOption = page.getByText('Compare', { exact: true });
        await compareOption.click();
        await page.waitForTimeout(2000);

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible({ timeout: 10000 });

        const fileListTable = page.locator('.ant-table-tbody');
        await expect(fileListTable.locator('tr').first()).toBeVisible({ timeout: 10000 });

        const leftVersionSelect = page.locator('.ant-select').nth(0);
        await leftVersionSelect.click();

        await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(500);

        const leftOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '26.1-snapshot-1' }).first();
        await leftOption.click();
        await page.waitForTimeout(5000);

        const rightVersionSelect = page.locator('.ant-select').nth(1);
        await expect(rightVersionSelect).toBeVisible({ timeout: 10000 });
        await rightVersionSelect.click();

        await expect(page.locator('.ant-select-dropdown:visible')).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(500);

        const rightOption = page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '26.1-snapshot-2' }).first();
        await rightOption.click();
        await page.waitForTimeout(5000);

        const searchInput = page.locator('input[placeholder="Search"]');
        await searchInput.fill('LevelRenderer');
        await page.waitForTimeout(1000);

        const firstFileRow = fileListTable.locator('tr').first();
        await expect(firstFileRow).toBeVisible({ timeout: 5000 });
        await firstFileRow.click();
        await page.waitForTimeout(1000);

        await expect(firstFileRow).toHaveClass(/ant-table-row-selected/, { timeout: 5000 });

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden({ timeout: 60000 });

        const editor = page.locator('.monaco-diff-editor');
        await expect(editor).toContainText('net.minecraft.client.renderer', { timeout: 10000 });
    });
});
