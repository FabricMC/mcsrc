import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Find All References', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Triggers find all references action', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const methodToken = page.locator('.method-token-decoration').first();
        await methodToken.click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Find All References', exact: true }).hover();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('button', { name: /Back$/ })).toBeVisible();

    });

    test('includes hierarchy references and navigates to a base call', async ({ page }) => {
        await page.goto('/');
        const search = page.getByRole('searchbox', { name: 'Search classes' });
        await search.fill('NavigationChild');
        await page.getByText('net/minecraft/NavigationChild', { exact: true }).click();
        await waitForDecompiledContent(page, 'class NavigationChild');
        await search.clear();

        await page.locator('.method-token-decoration').filter({ hasText: 'value' }).first().click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Find All References', exact: true }).hover();
        await page.keyboard.press('Enter');
        const hierarchy = page.getByRole('checkbox', { name: 'Include method hierarchy' });
        const parentCall = page.getByText(/^parentCall\(/);
        await expect(hierarchy).toBeChecked();
        await expect(parentCall).toBeVisible();

        await parentCall.click();
        await waitForDecompiledContent(page, 'class NavigationUsages');
        await hierarchy.uncheck();
        await expect(parentCall).toHaveCount(0);

        await page.reload();
        await waitForDecompiledContent(page, 'class NavigationUsages');
        await page.locator('.method-token-decoration-pointer').filter({ hasText: 'value' }).first().click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Find All References', exact: true }).hover();
        await page.keyboard.press('Enter');
        await expect(hierarchy).not.toBeChecked();
    });
});
