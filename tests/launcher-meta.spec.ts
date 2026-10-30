import { test, expect } from '@playwright/test';
import { setupTest, waitForBlockingModalToClose } from './test-utils';

test('Selects a comparison from the launcher swap button before comparing', async ({ page }) => {
    await setupTest(page);
    await page.goto('/');
    await waitForBlockingModalToClose(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('menuitem', { name: 'Tools' }).click();
    await page.getByRole('button', { name: 'Open metadata explorer' }).click();

    const swapButton = page.getByRole('button', { name: 'Swap launcher versions' });
    await expect(swapButton).toBeDisabled();
    await swapButton.locator('..').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Compare last two snapshots' }).click();

    const dialog = page.getByRole('dialog', { name: 'Minecraft launcher metadata' });
    await expect(dialog.getByRole('button', { name: 'Launcher version', exact: true })).toContainText('26.1-mock-2');
    await expect(dialog.getByRole('button', { name: 'Compare launcher version', exact: true })).toContainText('26.1-mock-3');
    await expect(swapButton).toBeEnabled();
});
