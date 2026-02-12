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

        const modalButton = page.getByTestId('jar-decompiler').first();
        await modalButton.waitFor();
        await modalButton.click();

        const splitsInput = page.getByTestId('jar-decompiler-splits').first();
        await splitsInput.waitFor();
        await splitsInput.fill('1');

        const okButton = page.getByTestId('jar-decompiler-ok').first();
        await okButton.waitFor();
        await okButton.click();

        const progress = page.getByTestId('jar-decompiler-progress').first();
        await progress.waitFor();
        await expect(progress).toContainText('com/mojang', { timeout: 30_000 });

        const stopButton = page.getByTestId('jar-decompiler-stop').first();
        await stopButton.click();

        const result = page.getByTestId('jar-decompiler-result').first();
        await result.waitFor();
        await expect(result).toContainText(/Decompiled [1-9][0-9]* new classes in/);
    });
});
