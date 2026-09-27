// KryptonVision PWA Service Worker
const CACHE_NAME = "kryptonvision-pwa-v4";
const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon.svg",
  "/favicon.ico",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("PWA pre-cache warning:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith("kryptonvision-pwa-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.mode === "navigate") {
    return;
  }

  const url = new URL(request.url);

  // Exclude all APIs, streams, media chunks, and websockets
  if (
    url.pathname === "/metrics" ||
    url.pathname === "/health" ||
    url.pathname === "/ready" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/v1/") ||
    url.pathname.startsWith("/stream/") ||
    url.pathname.includes(".m3u8") ||
    url.pathname.includes(".ts")
  ) {
    return;
  }

  // Next.js manages its own chunk caching. Development chunk URLs are reused
  // after edits, so caching them here can keep old styles and scripts alive.
  const isPrecachedAsset = STATIC_ASSETS.includes(url.pathname);

  if (url.origin !== self.location.origin || !isPrecachedAsset) {
    // Let the browser handle dynamic pages, RSC navigation, and data fetches natively
    return;
  }

  if (isPrecachedAsset) {
    // Stale-while-revalidate for static icons and manifest
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return networkResponse;
        }).catch(() => cachedResponse);
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

});
