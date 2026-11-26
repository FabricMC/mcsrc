import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Find All References', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('uses the file tree class icon and leaves member rows unadorned', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');
        const treeIcon = page.getByRole('treeitem', { name: /ChatFormatting/ }).locator('svg path');
        const enumIconPath = await treeIcon.getAttribute('d');

        const methodToken = page.locator('.method-token-decoration-pointer').filter({ hasText: /^fromEnum$/ });
        await methodToken.click({ button: 'right' });
        await page.getByRole('menuitem', { name: 'Find All References', exact: true }).hover();
        await page.keyboard.press('Enter');

        const results = page.getByRole('region', { name: 'net/minecraft/ChatFormatting' });
        const classIcon = results.getByRole('button', { name: /ChatFormatting/ }).locator('svg path');
        await expect.poll(() => classIcon.getAttribute('d')).toBe(enumIconPath);
        const reference = results.getByRole('button', { name: /^exampleMethod/ });
        await expect(reference).toBeVisible();
        await expect(reference.locator('svg')).toHaveCount(0);
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
        const usages = page.getByRole('region', { name: 'net/minecraft/NavigationUsages' });
        const parentCall = usages.getByRole('button', { name: /^parentCall\s*\(/ });
        await expect(hierarchy).toBeChecked();
        await expect(page.getByText('NavigationChild.value(String) → String', { exact: true })).toBeVisible();
        await expect(usages.getByRole('button', { name: /NavigationUsages/ })).toBeVisible();
        await expect(parentCall).toHaveText('parentCall(NavigationParent) → String');

        await parentCall.click();
        await expect(parentCall).toHaveAttribute('aria-current', 'location');
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
