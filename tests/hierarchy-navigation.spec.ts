import { test, expect, type Page } from '@playwright/test';
import { setupTest, waitForDecompiledContent, selectMinecraftVersion } from './test-utils';

async function openClass(page: Page, name: string) {
    const search = page.getByRole('searchbox', { name: 'Search classes' });
    await search.fill(name);
    await page.getByText(`net/minecraft/${name}`, { exact: true }).click();
    await waitForDecompiledContent(page, `class ${name}`);
    await search.clear();
}

test.beforeEach(async ({ page }) => {
    await setupTest(page);
    await page.goto('/');
});

test('navigates class inheritance in both directions and filters multiple targets', async ({ page }) => {
    await openClass(page, 'NavigationParent');
    const glyph = page.locator('.hierarchy-children').first();
    const glyphBounds = await glyph.boundingBox();
    await glyph.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Go to subclass / implementation');
    await expect(page.locator('.ant-modal-wrap:visible')).toHaveCount(0);
    await expect(async () => {
        const popupBounds = await dialog.boundingBox();
        expect(popupBounds).not.toBeNull();
        expect(popupBounds!.width).toBeLessThanOrEqual(410);
        expect(Math.abs(popupBounds!.x - glyphBounds!.x)).toBeLessThan(40);
        expect(Math.abs(popupBounds!.y - glyphBounds!.y)).toBeLessThan(40);
    }).toPass();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await glyph.click();
    await expect(dialog).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search classes' }).click();
    await expect(dialog).toBeHidden();
    await glyph.click();
    await dialog.getByRole('textbox', { name: 'Filter hierarchy targets' }).fill('Nested');
    await expect(dialog.getByRole('button')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('button', { name: 'net.minecraft.NavigationChild.Nested', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await waitForDecompiledContent(page, 'class Nested');
    await expect(dialog).toBeHidden();
    await page.locator('.hierarchy-parents').last().click();
    await waitForDecompiledContent(page, 'class NavigationParent');
});

test('navigates generic method overrides to source declarations and keeps line permalinks separate', async ({ page }) => {
    await openClass(page, 'NavigationParent');
    await page.locator('.hierarchy-children').nth(1).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Go to overriding / implementing method');
    await dialog.getByRole('textbox', { name: 'Filter hierarchy targets' }).fill('NavigationChild');
    await dialog.getByRole('button', { name: /^NavigationChild\.value/ }).click();
    await waitForDecompiledContent(page, 'String value(String');
    await expect(page).not.toHaveURL(/#L/);
    await page.locator('.hierarchy-parents').nth(1).click();
    await waitForDecompiledContent(page, 'class NavigationParent');
    await expect(page).not.toHaveURL(/#L/);
});

test('clears gutter markers after a version switch', async ({ page }) => {
    await openClass(page, 'NavigationChild');
    await expect(page.locator('.hierarchy-parents').first()).toBeVisible();
    await selectMinecraftVersion(page, '26.1-mock-2');
    await page.getByText('ChatFormatting', { exact: true }).first().click();
    await waitForDecompiledContent(page, 'enum ChatFormatting');
    await expect(page.locator('.hierarchy-glyph')).toHaveCount(0);
});


test('supports keyboard navigation and covariant method returns', async ({ page }) => {
    await openClass(page, 'NavigationChild');
    // Class, two overriding methods, nested class, and its overriding method; static methods have no marker.
    await expect(page.locator('.hierarchy-parents')).toHaveCount(5);
    await page.locator('.hierarchy-parents').nth(2).click();
    await waitForDecompiledContent(page, 'class NavigationParent');
    await page.keyboard.press('Alt+ArrowDown');
    await waitForDecompiledContent(page, 'class NavigationChild');
    await page.keyboard.press('Alt+ArrowUp');
    await waitForDecompiledContent(page, 'class NavigationParent');
});
