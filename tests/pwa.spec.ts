import { test, expect } from '@playwright/test';
import { setupTest } from './test-utils';

/**
 * PWA wiring: the manifest is served for installation, and the service worker caches the
 * app shell so the site still opens without a network.
 */
test.describe('PWA', () => {
    test.beforeEach(async ({ page }) => {
        await setupTest(page);
    });

    test('serves a valid manifest with installable icons', async ({ page }) => {
        await page.goto('/');

        const manifest = await page.evaluate(async () => {
            const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
            if (!link) return null;

            const response = await fetch(link.href);
            const json = await response.json();
            return { status: response.status, name: json.name, display: json.display, icons: json.icons.length };
        });

        expect(manifest).not.toBeNull();
        expect(manifest!.status).toBe(200);
        expect(manifest!.name).toBe('mcsrc');
        expect(manifest!.display).toBe('standalone');
        expect(manifest!.icons).toBeGreaterThanOrEqual(2);

        // Every declared icon actually resolves.
        const icon = await page.evaluate(async () => {
            const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
            const json = await (await fetch(link.href)).json();
            const results = await Promise.all((json.icons as { src: string }[]).map(async i => (await fetch(i.src)).status));
            return results;
        });
        expect(icon.every(status => status === 200)).toBe(true);
    });

    test('registers a service worker that caches the shell', async ({ page }) => {
        await page.goto('/');

        const worker = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return { supported: false };

            const registration = await navigator.serviceWorker.ready;
            const cacheNames = await caches.keys();
            const shell = await caches.open(cacheNames[0]);
            const cached = await shell.match('/');

            return {
                supported: true,
                active: Boolean(registration.active),
                cacheNames,
                shellCached: Boolean(cached),
            };
        });

        expect(worker.supported).toBe(true);
        expect(worker.active).toBe(true);
        expect(worker.shellCached).toBe(true);
    });

    test('opens the app with the network offline', async ({ page, context }) => {
        await page.goto('/');
        await page.evaluate(() => navigator.serviceWorker.ready);

        // Reload once so the controlled page is served by the service worker.
        await page.reload();
        await page.evaluate(() => navigator.serviceWorker.ready);

        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });

        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30000 });
    });
});
