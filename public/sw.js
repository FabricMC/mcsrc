// Minimal service worker: caches the app shell and the assets it references, so the SPA
// can open with no network. The shell is network-first so a deployment is picked up on the
// next load, while the cached copy is the fallback when the network is unavailable.

const CACHE = "mcsrc-shell-v1";
const SHELL_URL = "/";

/** Asset URLs referenced by an HTML document (scripts, stylesheets, icons). */
function assetUrls(html, baseUrl) {
    const urls = new Set();

    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        const value = match[1];

        // Skip inline/data URLs and anything already cached as the shell.
        if (value.startsWith("data:") || value === SHELL_URL) {
            continue;
        }

        try {
            const url = new URL(value, baseUrl);
            if (url.origin === self.location.origin) {
                urls.add(url.pathname);
            }
        } catch {
            // Ignore values that are not URLs.
        }
    }

    return [...urls];
}

async function cacheShellAndAssets(cache, html, baseUrl) {
    await cache.put(SHELL_URL, new Response(html, { headers: { "content-type": "text/html" } }));
    await cache.addAll(assetUrls(html, baseUrl));
}

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        const response = await fetch(SHELL_URL, { cache: "reload" });

        if (response.ok) {
            await cacheShellAndAssets(cache, await response.text(), self.location.origin);
        }

        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
    const request = event.request;

    // Only navigations: other requests are answered from the cache below when present.
    if (request.method !== "GET" || request.mode !== "navigate") {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);

        try {
            const response = await fetch(request);

            // A deep link answered with the host's 404 shell is still the app shell, so it
            // is cached under the shell key rather than under the deep link.
            if (!response.ok && response.status !== 404) {
                return response;
            }

            const html = await response.clone().text();
            await cacheShellAndAssets(cache, html, response.url || self.location.origin);

            return new Response(html, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
            });
        } catch {
            return (await cache.match(SHELL_URL))
                ?? (await cache.match("/index.html"))
                ?? Response.error();
        }
    })());
});

// Hashed assets are immutable, so serve them from the cache and only fall back to the network.
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET" || request.mode === "navigate") {
        return;
    }

    const url = new URL(request.url);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(url.pathname);
        if (cached) {
            return cached;
        }

        const response = await fetch(request);
        if (response.ok) {
            await cache.put(url.pathname, response.clone());
        }
        return response;
    })());
});
