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
            // Monaco enables menu mouse actions 100 ms after opening the menu.
            await page.waitForTimeout(150);
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
        // Monaco enables menu mouse actions 100 ms after opening the menu.
        await page.waitForTimeout(150);
        await page.getByRole('menuitem', { name: 'Copy Permalink' }).click();

        await expect(page.getByText('Copied Permalink')).toBeVisible();

        const clipboardText = await page.evaluate(() => (window as any).__clipboardText);
        const expected = '$(server_origin)/2/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer#L3'
            .replace('$(server_origin)', (new URL(page.url())).origin);
        expect(clipboardText).toEqual(expected);
    });

    test('Copy Link to Method includes the Minecraft version', async ({ page }) => {
        await page.goto('/2/26.1-mock-3/net/minecraft/NavigationChild');
        await waitForDecompiledContent(page, 'class NavigationChild');

        await page.getByRole('code').getByText('value', { exact: true }).first().click({ button: 'right' });
        await page.waitForTimeout(150);
        await expect(page.getByRole('menuitem', { name: 'Copy Link to Field' })).toHaveCount(0);
        await page.getByRole('menuitem', { name: 'Copy Link to Method' }).click();
        await expect(page.getByText('Copied Link to Method')).toBeVisible();

        const link = await page.evaluate(() => (window as any).__clipboardText);
        expect(link).toMatch(/\/2\/26\.1-mock-3\/net\/minecraft\/NavigationChild#value\(java.lang.String\)$/);
    });

    test('Copy Link to Field uses only the field name', async ({ page }) => {
        await page.goto('/2/26.1-mock-3/net/minecraft/ChatFormatting');
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        await page.getByRole('code').getByText('EXAMPLE', { exact: true }).click({ button: 'right' });
        await page.waitForTimeout(150);
        await expect(page.getByRole('menuitem', { name: 'Copy Link to Method' })).toHaveCount(0);
        await page.getByRole('menuitem', { name: 'Copy Link to Field' }).click();
        await expect(page.getByText('Copied Link to Field')).toBeVisible();

        const link = await page.evaluate(() => (window as any).__clipboardText);
        expect(link).toBe(`${new URL(page.url()).origin}/2/26.1-mock-3/net/minecraft/ChatFormatting#EXAMPLE`);
    });
});
