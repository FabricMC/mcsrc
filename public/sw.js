// Service worker: precaches the app shell and the modules the build emitted, so the SPA can
// open with no network.
//
// The file list comes from the Vite build manifest rather than from scraping index.html.
// The manifest carries the module graph, so it also reaches assets the HTML never mentions —
// notably the CSS belonging to lazily imported chunks, and emitted files like fonts.

const CACHE = "mcsrc-shell-v2";
const SHELL_URL = "/";
const BUILD_MANIFEST = "/manifest.json";

/** Normalises a manifest path to a root-relative URL path. */
function toPath(file) {
    return file.startsWith("/") ? file : `/${file}`;
}

/**
 * Every asset belonging to the app entry, following static imports.
 *
 * Dynamic imports are deliberately not followed: they are lazy by definition and the browser
 * loads them when needed. CSS and emitted assets are collected for each module reached.
 */
function assetsForEntry(manifest) {
    const entry = Object.values(manifest).find(item => item.isEntry);
    if (!entry) {
        console.warn("[sw] no entry found in the build manifest");
        return [];
    }

    // Manifest entries are looked up by their emitted file.
    const byFile = new Map(Object.values(manifest).map(item => [item.file, item]));

    const paths = new Set();
    const seen = new Set();
    const queue = [entry];

    while (queue.length > 0) {
        const item = queue.shift();
        if (!item || seen.has(item.file)) {
            continue;
        }
        seen.add(item.file);

        paths.add(toPath(item.file));

        for (const file of item.css ?? []) {
            paths.add(toPath(file));
        }
        for (const file of item.assets ?? []) {
            paths.add(toPath(file));
        }

        // `imports` holds manifest keys, so they resolve directly.
        for (const imported of item.imports ?? []) {
            const next = manifest[imported];
            if (next) {
                queue.push(next);
            }
        }
    }

    return [...paths];
}

/** Caches the shell and each asset individually, so one failure cannot reject the install. */
async function precache(manifest) {
    const cache = await caches.open(CACHE);

    const shell = await fetch(SHELL_URL, { cache: "reload" });
    if (shell.ok) {
        await cache.put(SHELL_URL, shell);
    }

    const paths = assetsForEntry(manifest);

    await Promise.all(paths.map(async path => {
        try {
            const response = await fetch(path, { cache: "reload" });
            if (response.ok) {
                await cache.put(path, response);
            } else {
                console.warn(`[sw] skipped ${path}: ${response.status}`);
            }
        } catch (e) {
            console.warn(`[sw] failed to cache ${path}`, e);
        }
    }));

    return paths.length;
}

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        try {
            const response = await fetch(BUILD_MANIFEST, { cache: "reload" });
            if (response.ok) {
                const count = await precache(await response.json());
                console.log(`[sw] precached the shell and ${count} assets from the build manifest`);
            } else {
                console.warn(`[sw] build manifest unavailable (${response.status})`);
            }
        } catch (e) {
            console.warn("[sw] precache failed", e);
        }

        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // Drop caches left by earlier versions.
        const names = await caches.keys();
        await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

// Navigations: network-first, so a deployment is picked up on the next load and the cached
// shell is only used when the network is unreachable.
self.addEventListener("fetch", (event) => {
    const request = event.request;

    if (request.method !== "GET" || request.mode !== "navigate") {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);

        try {
            const response = await fetch(request);

            // A deep link answered with the host's 404 shell is still the app shell, so it
            // is cached under the shell key rather than under the deep link.
            if (response.ok || response.status === 404) {
                await cache.put(SHELL_URL, response.clone());
            }

            return response;
        } catch {
            return (await cache.match(SHELL_URL))
                ?? (await cache.match("/index.html"))
                ?? Response.error();
        }
    })());
});

// Precached assets are immutable, so serve them from the cache and fall back to the network.
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
