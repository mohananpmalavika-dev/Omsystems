// KryptonVision PWA Service Worker
const CACHE_NAME = "kryptonvision-pwa-v3";
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
          .filter((name) => name !== CACHE_NAME)
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

  // Only handle static assets and Next.js static files
  const isPrecachedAsset = STATIC_ASSETS.includes(url.pathname);
  const isNextStatic = url.pathname.startsWith("/_next/static/");

  if (!isPrecachedAsset && !isNextStatic) {
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

  // Cache first for immutable next static chunks
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      } catch {
        return new Response("Asset unavailable offline", { status: 503, statusText: "Service Unavailable" });
      }
    })
  );
});
