import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Inheritance', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Shows inheritance tree and graph views', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const editor = page.locator('.monaco-editor').first();
        await editor.click({ button: 'right', position: { x: 100, y: 100 } });
        await page.waitForTimeout(500);

        const inheritanceOption = page.getByText('View Inheritance Hierarchy');
        await inheritanceOption.click();

        const treeTab = page.getByRole('tab', { name: 'Tree' });
        await expect(treeTab).toBeVisible();
        await expect(treeTab).toHaveAttribute('aria-selected', 'true');

        const modal = page.getByRole('dialog');
        const treeView = modal.locator('.ant-tree');
        await expect(treeView).toBeVisible();

        const graphTab = page.getByRole('tab', { name: 'Graph' });
        await graphTab.click();
        await expect(graphTab).toHaveAttribute('aria-selected', 'true');

        const graphView = modal.locator('.react-flow');
        await expect(graphView).toBeVisible();
    });
});
