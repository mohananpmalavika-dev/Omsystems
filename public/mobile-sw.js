/**
 * Sentinel Grid Mobile Service Worker
 * Provides offline support and background sync for mobile operations
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `sentinel-mobile-static-${CACHE_VERSION}`;
const DATA_CACHE = `sentinel-mobile-data-${CACHE_VERSION}`;
const IMAGE_CACHE = `sentinel-mobile-images-${CACHE_VERSION}`;

// Static assets to cache on install
const STATIC_ASSETS = [
  "/mobile",
  "/manifest.json",
  "/icons/sentinel-grid-icon.png",
  "/icons/badge-icon.png",
];

// API endpoints to cache
const API_ENDPOINTS = [
  "/api/mobile/v1/home",
];

/**
 * Install event - cache static assets
 */
self.addEventListener("install", (event) => {
  console.log("[ServiceWorker] Installing...");

  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[ServiceWorker] Caching static assets");
      return cache.addAll(STATIC_ASSETS);
    })
  );

  // Force activation
  self.skipWaiting();
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener("activate", (event) => {
  console.log("[ServiceWorker] Activating...");

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (
            cacheName !== STATIC_CACHE &&
            cacheName !== DATA_CACHE &&
            cacheName !== IMAGE_CACHE
          ) {
            console.log("[ServiceWorker] Removing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Take control of all clients
  return self.clients.claim();
});

/**
 * Fetch event - serve from cache when offline
 */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip SSE connections
  if (url.pathname === "/api/mobile/v1/events") {
    return;
  }

  // Handle API requests (network-first, cache fallback)
  if (url.pathname.startsWith("/api/mobile/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(DATA_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log("[ServiceWorker] Serving from cache:", url.pathname);
              return cachedResponse;
            }

            // No cache available
            return new Response(
              JSON.stringify({
                success: false,
                error: "offline",
                message: "You are offline and this data is not cached",
              }),
              {
                status: 503,
                headers: { "Content-Type": "application/json" },
              }
            );
          });
        })
    );
    return;
  }

  // Handle images (cache-first, network fallback)
  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(IMAGE_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Handle static assets (cache-first, network fallback)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        // Cache successful responses for static assets
        if (response.status === 200 && url.origin === self.location.origin) {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

/**
 * Background sync event - sync pending actions
 */
self.addEventListener("sync", (event) => {
  console.log("[ServiceWorker] Background sync:", event.tag);

  if (event.tag === "sync-mobile-actions") {
    event.waitUntil(syncPendingActions());
  }
});

/**
 * Sync pending actions with server
 */
async function syncPendingActions() {
  try {
    // Open IndexedDB
    const db = await openIndexedDB();
    const actions = await getAllPendingActions(db);

    console.log(`[ServiceWorker] Syncing ${actions.length} pending actions`);

    for (const action of actions) {
      try {
        const endpoint = getActionEndpoint(action);
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action.payload),
        });

        if (response.ok) {
          // Remove synced action
          await removePendingAction(db, action.id);
          console.log(`[ServiceWorker] Synced action ${action.id}`);
        }
      } catch (error) {
        console.error(`[ServiceWorker] Failed to sync action ${action.id}:`, error);
      }
    }

    // Notify clients of sync completion
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "SYNC_COMPLETE",
        actionsCount: actions.length,
      });
    });
  } catch (error) {
    console.error("[ServiceWorker] Sync failed:", error);
  }
}

/**
 * Open IndexedDB
 */
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sentinel_mobile_cache", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all pending actions from IndexedDB
 */
function getAllPendingActions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["pending_actions"], "readonly");
    const store = transaction.objectStore("pending_actions");
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove pending action from IndexedDB
 */
function removePendingAction(db, actionId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["pending_actions"], "readwrite");
    const store = transaction.objectStore("pending_actions");
    const request = store.delete(actionId);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get API endpoint for action
 */
function getActionEndpoint(action) {
  const base = "/api/mobile/v1/incidents";
  switch (action.type) {
    case "acknowledge":
      return `${base}/${action.incidentId}/acknowledge`;
    case "escalate":
      return `${base}/${action.incidentId}/escalate`;
    case "assign":
      return `${base}/${action.incidentId}/assign`;
    case "note":
      return `${base}/${action.incidentId}/notes`;
    default:
      return base;
  }
}

/**
 * Push notification event
 */
self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }

  try {
    const data = event.data.json();
    
    console.log("[ServiceWorker] Push notification received:", data);

    const options = {
      body: data.body,
      icon: data.icon || "/icons/sentinel-grid-icon.png",
      badge: data.badge || "/icons/badge-icon.png",
      tag: data.tag || "sentinel-notification",
      data: data.data,
      requireInteraction: data.requireInteraction || false,
      vibrate: data.vibrate,
      actions: data.actions || [],
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  } catch (error) {
    console.error("[ServiceWorker] Error handling push notification:", error);
  }
});

/**
 * Notification click event
 */
self.addEventListener("notificationclick", (event) => {
  console.log("[ServiceWorker] Notification clicked:", event.notification.tag);

  event.notification.close();

  const clickAction = event.notification.data?.clickAction;

  if (clickAction) {
    event.waitUntil(
      clients.openWindow(clickAction)
    );
  } else {
    event.waitUntil(
      clients.openWindow("/mobile")
    );
  }
});

/**
 * Message event - handle messages from clients
 */
self.addEventListener("message", (event) => {
  console.log("[ServiceWorker] Message received:", event.data);

  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
