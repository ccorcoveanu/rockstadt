/* Rockstadt REF planner service worker.
 * Shell: network-first with cache fallback so the app opens with zero signal.
 * Static assets & posters: cache-first (immutable, hashed or versioned).
 * API GETs: network-first fallback; live data truth lives in IndexedDB anyway.
 */
const VERSION = "__SW_VERSION__";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const API_CACHE = `${VERSION}-api`;

const SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(VERSION))
          .map((n) => caches.delete(n))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

async function networkFirst(event, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const response = preload ?? (await fetch(event.request));
    if (response.ok) cache.put(event.request, response.clone());
    return response;
  } catch {
    const cached =
      (await cache.match(event.request)) ??
      (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (cached) return cached;
    throw new Error("offline and uncached");
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.ok) cache.put(event.request, response.clone());
  return response;
}

const API_GET_CACHEABLE = /^\/api\/(schedule|tags|assignments|posters\/\d)$/;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(event, SHELL_CACHE, "/"));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.match(/\.(png|jpg|woff2?)$/)) {
    event.respondWith(cacheFirst(event, ASSET_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/posters/")) {
    event.respondWith(cacheFirst(event, ASSET_CACHE));
    return;
  }
  if (API_GET_CACHEABLE.test(url.pathname)) {
    event.respondWith(networkFirst(event, API_CACHE));
    return;
  }
});
