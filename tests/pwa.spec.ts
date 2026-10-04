import { test, expect, type Page } from '@playwright/test';
import { setupTest } from './test-utils';

/**
 * Service worker behaviour is only asserted on Chromium. Playwright's Firefox emulates
 * offline by rejecting the navigation itself (NS_ERROR_OFFLINE) before the worker can
 * answer it, so the offline path cannot be verified there.
 */
const NOT_CHROMIUM = 'service worker offline behaviour is only verified on Chromium';

/** The shell is written by the install handler, which runs after the worker is active. */
async function shellIsCached(page: Page): Promise<boolean> {
    return page.evaluate(async () => {
        const names = await caches.keys();
        for (const name of names) {
            const cache = await caches.open(name);
            if (await cache.match('/')) {
                return true;
            }
        }
        return false;
    });
}

/** Waits until the service worker is actually controlling the page, not merely active. */
async function waitForController(page: Page) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 30000 });
}

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

    test('registers a service worker that caches the shell', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', NOT_CHROMIUM);

        await page.goto('/');

        const worker = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return { supported: false };

            const registration = await navigator.serviceWorker.ready;
            return { supported: true, active: Boolean(registration.active) };
        });

        expect(worker.supported).toBe(true);
        expect(worker.active).toBe(true);

        // `ready` resolves as soon as the worker activates, which is before the install
        // handler has finished caching, so poll instead of reading the cache once.
        await expect.poll(() => shellIsCached(page), { timeout: 30000 }).toBe(true);
    });

    test('opens the app with the network offline', async ({ page, context, browserName }) => {
        test.skip(browserName !== 'chromium', NOT_CHROMIUM);

        await page.goto('/');

        // The page has to be under the worker's control, otherwise going offline replaces
        // the document with a network error instead of the cached shell.
        await waitForController(page);

        await context.setOffline(true);
        await page.reload({ waitUntil: 'domcontentloaded' });

        await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30000 });
    });
});
