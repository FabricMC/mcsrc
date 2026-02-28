import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Permalinks and Line Highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Permalink with line range highlights multiple lines (new format)', async ({ page }) => {
        await page.goto('/1/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Permalink with line range highlights multiple lines (old hash format)', async ({ page }) => {
        await page.goto('/#1/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Shift-clicking line number creates line range', async ({ page }) => {
        await page.goto('/');
        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'enum ChatFormatting');

        const editor = page.locator('.monaco-editor');
        await expect(editor).toBeVisible();

        // First click to select starting line
        const lineNumbers = editor.locator('.line-numbers');
        await lineNumbers.first().click();

        // Wait for URL to update
        await page.waitForTimeout(10);
        const urlAfterFirstClick = page.url();
        expect(urlAfterFirstClick).toMatch(/\/1\/.*#L\d+$/);

        // Shift-click on a different line to create range
        await lineNumbers.nth(5).click({ modifiers: ['Shift'] });

        // Wait for URL to update
        await page.waitForTimeout(10);

        // Check that URL now contains a line range (new path-based format)
        expect(page.url()).toMatch(/\/1\/.*#L\d+-\d+$/);
        expect(page.url()).not.toEqual(urlAfterFirstClick);

        // Check that lines are highlighted
        const highlightedLine = editor.locator('.highlighted-line');
        await expect(highlightedLine.first()).toBeVisible();
    });
});
