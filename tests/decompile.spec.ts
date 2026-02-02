import { test } from '@playwright/test';
import { waitForDecompiledContent, setupTest } from './test-utils';

test.describe('Decompilation', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('Decompiles default class on initial load', async ({ page }) => {
        await page.goto('/');
        await waitForDecompiledContent(page, 'enum ChatFormatting');
    });
});
