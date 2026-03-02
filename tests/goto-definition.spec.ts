import { test } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Go to Definition', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Ctrl+click on fromEnum navigates to StringRepresentable', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const methodToken = page.locator('.method-token-decoration-pointer').filter({ hasText: 'fromEnum' }).first();
        await methodToken.click();

        await page.keyboard.press('F12');

        await waitForDecompiledContent(page, 'interface StringRepresentable');
    });
});
