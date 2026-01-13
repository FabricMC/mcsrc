import { test, expect } from '@playwright/test';
import { setupTest } from './test-utils';

test.describe('Bytecode Setting', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
        await page.addInitScript(() => {
            localStorage.setItem('setting_bytecode', 'true');
        });
    });

    test('Shows bytecode when enabled', async ({ page }) => {
        await page.goto('/');
        await page.waitForTimeout(2000);

        const editor = page.getByRole("code").first();
        await expect(editor).toContainText('// access flags', { timeout: 15000 });
    });
});
