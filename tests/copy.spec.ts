import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Copy Actions in Code Context Actions', () => {
    const testOptions = [
        {
            name: 'Copy Access Transformer',
            successMessage: 'Copied Access Transformer',
            copyText: 'public net.minecraft.ChatFormatting',
        },
        {
            name: 'Copy Class Tweaker / Access Widener',
            successMessage: 'Copied Class Tweaker',
            copyText: 'accessible class net/minecraft/ChatFormatting',
        },
        {
            name: 'Copy Mixin Target',
            successMessage: 'Copied Mixin Target',
            copyText: 'net/minecraft/ChatFormatting',
        },
        {
            name: 'Copy Permalink',
            successMessage: 'Copied Permalink',
            copyText: '$(server_origin)/1/26.1-mock-2/net/minecraft/ChatFormatting#L3',
        }
        // Monaco native copy is jumped due to its own copy implementation
    ];

    test.beforeEach(async ({ page }) => {
        await setupTest(page);

        // Mock the clipboard API
        await page.addInitScript(() => {
            navigator.clipboard.writeText = async (test: string) => {
                (window as any).__clipboardText = test;
            };
        });
    });

    for (const { name, successMessage, copyText } of testOptions) {
        test(name + ' (normal mode)', async ({ page }) => {
            await page.goto('/1/26.1-mock-2/net/minecraft/ChatFormatting');
            await waitForDecompiledContent(page, 'enum ChatFormatting');

            await page.getByRole('code').getByText('ChatFormatting').click({ button: 'right' });
            // Use anyway. Maybe the hook needs some time.
            await page.waitForTimeout(50);
            await page.getByRole('menuitem', { name: name }).click();

            await expect(page.getByText(successMessage)).toBeVisible();

            const clipboardText = await page.evaluate(() => (window as any).__clipboardText);
            expect(clipboardText).toEqual(copyText.replace('$(server_origin)', (new URL(page.url())).origin));
        });
    }

    test('Copy Permalink (diff mode)', async ({ page }) => {
        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');
        await waitForDecompiledContent(page, 'class LevelRenderer');

        await page.getByRole('code').getByText('LevelRenderer').first().click({ button: 'right' });
        // Use anyway. Maybe the hook needs some time.
        await page.waitForTimeout(50);
        await page.getByRole('menuitem', { name: 'Copy Permalink' }).click();

        await expect(page.getByText('Copied Permalink')).toBeVisible();

        const clipboardText = await page.evaluate(() => (window as any).__clipboardText);
        const expected = '$(server_origin)/2/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer#L3'
            .replace('$(server_origin)', (new URL(page.url())).origin);
        expect(clipboardText).toEqual(expected);
    });
});
