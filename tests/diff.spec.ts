import { test, expect, type Page } from '@playwright/test';
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
        await expect(editor).toContainText('net.minecraft.client.renderer');
    });

    test('navigates between diff sections and changed files', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 420 });
        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible();
        await expect(page.getByText('Decompiling...')).toBeHidden();
        await expect(diffEditor).toContainText('hello world 2');

        const nextButton = page.getByRole('button', { name: 'Next diff', exact: true });
        const previousButton = page.getByRole('button', { name: 'Previous diff', exact: true });
        await expect(nextButton).toBeEnabled();
        await expect(previousButton).toBeEnabled();

        const initialLine = await getModifiedTopLine(page);
        await nextButton.click();
        await nextButton.click();
        await expect.poll(() => getModifiedTopLine(page)).toBeGreaterThan(initialLine);
        const secondDiffLine = await getModifiedTopLine(page);

        await previousButton.click();
        await expect.poll(() => getModifiedTopLine(page)).toBeLessThan(secondDiffLine);

        await previousButton.click();
        await expect(page.locator('.diff-file-row-selected .diff-file-name')).toHaveText('Dummy');
        await expect(diffEditor).toContainText('class Dummy');
    });
});

async function getModifiedTopLine(page: Page) {
    return page.evaluate(() => {
        const diffEditor = document.querySelector('.monaco-diff-editor');
        const monacoEditors = diffEditor?.querySelectorAll('.monaco-editor') || [];
        const modifiedEditor = diffEditor?.querySelector('.modified-in-monaco-diff-editor')
            || monacoEditors[1]
            || monacoEditors[0];
        const lineNumbers = Array.from(modifiedEditor?.querySelectorAll('.line-numbers') || [])
            .map(element => Number(element.textContent?.trim()))
            .filter(Number.isFinite);

        return lineNumbers.length > 0 ? Math.min(...lineNumbers) : 0;
    });
}
