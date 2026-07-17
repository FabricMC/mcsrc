import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Permalinks and Line Highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Permalink with line range highlights multiple lines (new format, normal mode)', async ({ page }) => {
        await page.goto('/1/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Permalink with line range highlights multiple lines (new format, diff mode)', async ({ page }) => {
        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer#R87-90');

        await waitForDecompiledContent(page, 'class LevelRenderer');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Permalink with line range highlights multiple lines (old hash format, normal mode)', async ({ page }) => {
        await page.goto('/#1/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Permalink with line range highlights multiple lines (old hash format, diff mode)', async ({ page }) => {
        await page.goto('/#1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer#R87-90');

        await waitForDecompiledContent(page, 'class LevelRenderer');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();
    });

    test('Version-only permalink selects the requested version', async ({ page }) => {
        await page.goto('/1/26.1-mock-2');

        const versionSelect = page.getByRole('button', { name: /26\.1-mock-2/ }).first();
        await expect(versionSelect).toContainText('26.1-mock-2');
    });

    test('Shift-clicking line number creates line range (normal mode)', async ({ page }) => {
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

    test('Shift-clicking line number creates line range (diff mode)', async ({ page }) => {
        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');

        // 0 - diff editor, 1 - left editor, 2 - right editor
        const editor = page.locator('.monaco-editor').nth(2);
        await expect(editor).toBeVisible();

        // First click to select starting line
        const lineNumbers = editor.locator('.line-numbers');
        // I have no idea why there's a 0px div with class line-numbers, only in webkit & firefox
        // Which will cause infinite waiting on click
        // So we use nth(1), which is the acutal line 1
        await lineNumbers.nth(1).click();

        // Wait for URL to update
        await page.waitForTimeout(10);
        const urlAfterFirstClick = page.url();
        expect(urlAfterFirstClick).toMatch(/\/1\/diff\/.*#R\d+$/);

        // Shift-click on a different line to create range
        await lineNumbers.nth(5).click({ modifiers: ['Shift'] });

        // Wait for URL to update
        await page.waitForTimeout(10);

        // Check that URL now contains a line range (new path-based format)
        expect(page.url()).toMatch(/\/1\/diff\/.*#R\d+-\d+$/);
        expect(page.url()).not.toEqual(urlAfterFirstClick);

        // Check that lines are highlighted
        const highlightedLine = editor.locator('.highlighted-line');
        await expect(highlightedLine.first()).toBeVisible();
    });

    test('Diff permalink restores left and right versions and opens diff view', async ({ page }) => {
        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible();

        const leftVersionSelect = page.getByRole('button', { name: /26\.1-mock-1/ }).first();
        const rightVersionSelect = page.getByRole('button', { name: /26\.1-mock-2/ }).first();

        await expect(leftVersionSelect).toContainText('26.1-mock-1');
        await expect(rightVersionSelect).toContainText('26.1-mock-2');

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden();

        await expect(diffEditor).toContainText('net.minecraft.client.renderer');
    });
});
