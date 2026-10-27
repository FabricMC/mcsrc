import { test, expect } from '@playwright/test';
import { setupTest, waitForDecompiledContent } from './test-utils';

test('opens class history and loads the version list', async ({ page }) => {
    await setupTest(page);
    await page.goto('/2/26.1-mock-3/net/minecraft/ChatFormatting');
    await waitForDecompiledContent(page, 'enum ChatFormatting');
    await page.locator('.class-history-glyph').click();

    const popup = page.getByRole('dialog', { name: 'Class history', exact: true });
    await expect(popup).toBeVisible();
    const currentVersion = popup.getByRole('button', { name: '26.1-mock-3, current version' });
    await expect(currentVersion).toBeDisabled();
    await expect(currentVersion).toContainText('Changed');
    await expect(popup.getByRole('button', { name: 'Compare 26.1-mock-3 with 26.1-mock-2' })).toBeVisible();
    await popup.getByRole('button', { name: 'Close class history' }).click();
    await expect(popup).toBeHidden();
});
