import { expect, test } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Decompilation', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Decompiles default class on initial load', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });

    test('Decompile many classes', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const modalButton = page.locator('[data-e2e="jar-decompiler"]').first();
        await modalButton.waitFor();
        await modalButton.click();

        const splitsInput = page.locator('[data-e2e="jar-decompiler-splits"]').first();
        await splitsInput.waitFor();
        await splitsInput.fill('1');

        const okButton = page.locator('[data-e2e="jar-decompiler-ok"]').first();
        await okButton.waitFor();
        await okButton.click();

        const progress = page.locator('[data-e2e="jar-decompiler-progress"]').first();
        await progress.waitFor();
        await expect(progress).toContainText('com/mojang');

        const stopButton = page.locator('[data-e2e="jar-decompiler-stop"]').first();
        await stopButton.click();

        const result = page.locator('[data-e2e="jar-decompiler-result"]').first();
        await result.waitFor();
        await expect(result).toContainText(/Decompiled [1-9][0-9]* new classes in/);
    });
});
