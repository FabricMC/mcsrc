import { test, expect } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Permalinks and Line Highlighting', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Permalink with line range highlights multiple lines (/1/ format)', async ({ page }) => {
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        await page.goto('/1/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();

        await expect(page.getByText('Note: Using legacy decompiler (Vineflower 1.11.2)')).toBeVisible();
        expect(consoleLogs.some(log => log.includes('Loading VineFlower 1.11.2'))).toBe(true);
    });

    test('Permalink with line range highlights multiple lines (/2/ format)', async ({ page }) => {
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        await page.goto('/2/26.1-snapshot-1/net/minecraft/SystemReport#L87-90');

        await waitForDecompiledContent(page, 'class SystemReport');

        const editor = page.locator('.monaco-editor');
        const highlightedLines = editor.locator('.highlighted-line');
        await expect(highlightedLines.first()).toBeVisible();

        expect(consoleLogs.some(log => log.includes('Loading VineFlower 1.12.0'))).toBe(true);
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
        expect(urlAfterFirstClick).toMatch(/\/2\/.*#L\d+$/);

        // Shift-click on a different line to create range
        await lineNumbers.nth(5).click({ modifiers: ['Shift'] });

        // Wait for URL to update
        await page.waitForTimeout(10);

        // Check that URL now contains a line range (new path-based format)
        expect(page.url()).toMatch(/\/2\/.*#L\d+-\d+$/);
        expect(page.url()).not.toEqual(urlAfterFirstClick);

        // Check that lines are highlighted
        const highlightedLine = editor.locator('.highlighted-line');
        await expect(highlightedLine.first()).toBeVisible();
    });

    test('Diff permalink restores left and right versions and opens diff view (/1/ format)', async ({ page }) => {
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        await page.goto('/1/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible();

        const leftVersionSelect = page.locator('.ant-select').nth(0);
        const rightVersionSelect = page.locator('.ant-select').nth(1);

        await expect(leftVersionSelect).toContainText('26.1-mock-1');
        await expect(rightVersionSelect).toContainText('26.1-mock-2');

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden();

        await expect(diffEditor).toContainText('net.minecraft.client.renderer');

        expect(consoleLogs.some(log => log.includes('Loading VineFlower 1.12.0'))).toBe(true);
    });

    test('Diff permalink restores left and right versions and opens diff view (/2/ format)', async ({ page }) => {
        const consoleLogs: string[] = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        await page.goto('/2/diff/26.1-mock-1/26.1-mock-2/net/minecraft/client/renderer/LevelRenderer');

        const diffEditor = page.locator('.monaco-diff-editor');
        await expect(diffEditor).toBeVisible();

        const leftVersionSelect = page.locator('.ant-select').nth(0);
        const rightVersionSelect = page.locator('.ant-select').nth(1);

        await expect(leftVersionSelect).toContainText('26.1-mock-1');
        await expect(rightVersionSelect).toContainText('26.1-mock-2');

        const decompilingMessage = page.getByText('Decompiling...');
        await expect(decompilingMessage).toBeHidden();

        await expect(diffEditor).toContainText('net.minecraft.client.renderer');

        expect(consoleLogs.some(log => log.includes('Loading VineFlower 1.12.0'))).toBe(true);
    });
});
