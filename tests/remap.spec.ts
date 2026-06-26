import { expect, test } from '@playwright/test';
import { setupTest, selectMinecraftVersion, waitForDecompiledContent } from './test-utils';

test.describe('Mapped Minecraft versions', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Remaps obfuscated classes before search and decompile', async ({ page }) => {
        await page.goto('/');
        await selectMinecraftVersion(page, '19w36a');

        const searchBox = page.getByRole('searchbox', { name: 'Search classes' });
        await searchBox.fill('ChatFormatting');

        await page.getByText('net/minecraft/ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const editor = page.getByRole('code').first();
        await expect(editor).toContainText('package net.minecraft');
    });

    test('Uses the cached remapped jar when switching back', async ({ page }) => {
        let remapCount = 0;
        page.on('console', message => {
            if (message.text().includes('Remapped') && message.text().includes('19w36a')) {
                remapCount++;
            }
        });

        await page.goto('/');
        await selectMinecraftVersion(page, '19w36a');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');
        await expect.poll(() => remapCount).toBe(1);

        await selectMinecraftVersion(page, '26.1-mock-2');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        await selectMinecraftVersion(page, '19w36a');
        await waitForDecompiledContent(page, 'enum ChatFormatting');
        await expect.poll(() => remapCount).toBe(1);
    });
});
