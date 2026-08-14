import { expect, test } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Decompilation', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Decompiles default class on initial load', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });

    test('Decompile many classes', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        await page.getByRole('button', { name: 'Settings' }).click();
        await page.getByRole('tab', { name: 'Advanced' }).click();
        await page.getByTestId('jar-decompiler').click();

        const splitsInput = page.getByTestId('jar-decompiler-splits').first();
        await splitsInput.waitFor();
        await splitsInput.fill('1');

        await page.getByTestId('jar-decompiler-ok').click();

        const result = page.getByTestId('jar-decompiler-result').first();
        await result.waitFor();
        await expect(result).toContainText(/Decompiled [1-9][0-9]* new classes in/);
    });
});
