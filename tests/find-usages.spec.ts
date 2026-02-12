import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest, waitForIndexing } from './test-utils';

test.describe('Find Usages', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
        await waitForIndexing(page);
    });

    test('Triggers find usages action', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        await page.waitForTimeout(1500);

        const methodToken = page.locator('.method-token-decoration').first();
        await methodToken.click();

        await page.keyboard.press('Alt+F12');

        await page.waitForTimeout(1000);

        const editor = page.getByRole("code").first();
        await expect(editor).toBeVisible();
    });
});
