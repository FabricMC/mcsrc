import { expect, test } from '@playwright/test';
import { setupTest, waitForDecompiledContent } from './test-utils';

const SERVER = 'http://127.0.0.1:8000';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

async function setupAnnotaterServer(page: import('@playwright/test').Page) {
    const fulfill = (body: string, contentType: string) => ({
        status: 200,
        contentType,
        headers: corsHeaders,
        body,
    });

    await page.route(`${SERVER}/config`, route => route.fulfill(
        fulfill(JSON.stringify({ version: '26.1-mock-1' }), 'application/json')));

    await page.route(`${SERVER}/ping`, route => route.fulfill(fulfill('', 'text/plain')));

    await page.route(`${SERVER}/get-mapping`, route => route.fulfill(
        fulfill('CLASS net/minecraft/client/renderer/LevelRenderer\n\tCOMMENT The level renderer\n', 'text/plain; charset=utf-8')));

    await page.route(`${SERVER}/update-mapping`, route => route.fulfill(
        fulfill(JSON.stringify({ details: 'Mapping updated' }), 'application/json')));
}

test.describe('Annotater server', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
        await setupAnnotaterServer(page);
    });

    test('shows javadoc when connecting with a file already opened', async ({ page }) => {
        await page.goto(`/2/26.1-mock-1/net/minecraft/client/renderer/LevelRenderer.class?annotater-server=${SERVER}`);
        await waitForDecompiledContent(page, 'public class LevelRenderer');

        await expect(page.getByRole('button', { name: 'Annotatering: exit Javadoc editing mode' })).toBeVisible();
        await expect(page.getByText('The level renderer')).toBeVisible();
    });

    test('shows javadoc after navigating to another file and back', async ({ page }) => {
        await page.goto(`/2/26.1-mock-1/net/minecraft/client/renderer/LevelRenderer.class?annotater-server=${SERVER}`);
        await waitForDecompiledContent(page, 'public class LevelRenderer');
        await expect(page.getByRole('button', { name: 'Annotatering: exit Javadoc editing mode' })).toBeVisible();

        await page.getByText('ChatFormatting', { exact: true }).click();
        await waitForDecompiledContent(page, 'public enum ChatFormatting');

        await page.getByText('LevelRenderer', { exact: true }).and(page.locator('span')).click();
        await waitForDecompiledContent(page, 'public class LevelRenderer');

        await expect(page.getByText('The level renderer')).toBeVisible();
    });
});
