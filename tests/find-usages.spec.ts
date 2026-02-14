import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest, waitForIndexing } from './test-utils';

test.describe('Find All References', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
        await waitForIndexing(page);
    });

    test('Triggers find all references action', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const methodToken = page.locator('.method-token-decoration').first();
        await methodToken.click();

        await page.keyboard.press('Alt+F12');

        const editor = page.getByRole("code").first();
        await expect(editor).toBeVisible();
    });
});
