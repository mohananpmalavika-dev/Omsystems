/**
 * Mobile Offline Hook
 * Manages offline mode, data caching, and sync for mobile operations
 */

import { useState, useEffect, useCallback, useRef } from "react";

interface OfflineState {
  isOnline: boolean;
  lastSync: Date | null;
  pendingActions: PendingAction[];
  cachedIncidents: any[];
  cachedBranchHealth: any;
}

interface PendingAction {
  id: string;
  type: "acknowledge" | "escalate" | "assign" | "note";
  incidentId: string;
  payload: any;
  timestamp: Date;
  retryCount: number;
}

const DB_NAME = "sentinel_mobile_cache";
const DB_VERSION = 1;
const INCIDENTS_STORE = "incidents";
const ACTIONS_STORE = "pending_actions";
const METADATA_STORE = "metadata";

/**
 * Open IndexedDB
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Incidents store
      if (!db.objectStoreNames.contains(INCIDENTS_STORE)) {
        const incidentsStore = db.createObjectStore(INCIDENTS_STORE, { keyPath: "id" });
        incidentsStore.createIndex("severity", "severity", { unique: false });
        incidentsStore.createIndex("acknowledged", "acknowledged", { unique: false });
        incidentsStore.createIndex("occurredAt", "occurredAt", { unique: false });
      }

      // Pending actions store
      if (!db.objectStoreNames.contains(ACTIONS_STORE)) {
        const actionsStore = db.createObjectStore(ACTIONS_STORE, { keyPath: "id" });
        actionsStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // Metadata store
      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };
  });
}

/**
 * Cache incidents to IndexedDB
 */
async function cacheIncidents(incidents: any[]) {
  const db = await openDB();
  const transaction = db.transaction([INCIDENTS_STORE], "readwrite");
  const store = transaction.objectStore(INCIDENTS_STORE);

  // Clear existing and add new
  await store.clear();
  for (const incident of incidents) {
    await store.add(incident);
  }

  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get cached incidents from IndexedDB
 */
async function getCachedIncidents(): Promise<any[]> {
  const db = await openDB();
  const transaction = db.transaction([INCIDENTS_STORE], "readonly");
  const store = transaction.objectStore(INCIDENTS_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add pending action to IndexedDB
 */
async function addPendingAction(action: Omit<PendingAction, "id" | "timestamp" | "retryCount">) {
  const db = await openDB();
  const transaction = db.transaction([ACTIONS_STORE], "readwrite");
  const store = transaction.objectStore(ACTIONS_STORE);

  const pendingAction: PendingAction = {
    ...action,
    id: `action-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date(),
    retryCount: 0,
  };

  await store.add(pendingAction);

  return new Promise<PendingAction>((resolve, reject) => {
    transaction.oncomplete = () => resolve(pendingAction);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get pending actions from IndexedDB
 */
async function getPendingActions(): Promise<PendingAction[]> {
  const db = await openDB();
  const transaction = db.transaction([ACTIONS_STORE], "readonly");
  const store = transaction.objectStore(ACTIONS_STORE);

  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove pending action from IndexedDB
 */
async function removePendingAction(actionId: string) {
  const db = await openDB();
  const transaction = db.transaction([ACTIONS_STORE], "readwrite");
  const store = transaction.objectStore(ACTIONS_STORE);

  await store.delete(actionId);

  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Update metadata in IndexedDB
 */
async function updateMetadata(key: string, value: any) {
  const db = await openDB();
  const transaction = db.transaction([METADATA_STORE], "readwrite");
  const store = transaction.objectStore(METADATA_STORE);

  await store.put({ key, value, timestamp: new Date().toISOString() });

  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Get metadata from IndexedDB
 */
async function getMetadata(key: string): Promise<any> {
  const db = await openDB();
  const transaction = db.transaction([METADATA_STORE], "readonly");
  const store = transaction.objectStore(METADATA_STORE);

  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Mobile Offline Hook
 */
export function useMobileOffline() {
  const [offlineState, setOfflineState] = useState<OfflineState>({
    isOnline: navigator.onLine,
    lastSync: null,
    pendingActions: [],
    cachedIncidents: [],
    cachedBranchHealth: null,
  });

  const syncInProgressRef = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update online status
   */
  const updateOnlineStatus = useCallback(() => {
    setOfflineState((prev) => ({
      ...prev,
      isOnline: navigator.onLine,
    }));
  }, []);

  /**
   * Load cached data from IndexedDB
   */
  const loadCachedData = useCallback(async () => {
    try {
      const incidents = await getCachedIncidents();
      const pendingActions = await getPendingActions();
      const lastSync = await getMetadata("lastSync");
      const branchHealth = await getMetadata("branchHealth");

      setOfflineState((prev) => ({
        ...prev,
        cachedIncidents: incidents,
        pendingActions,
        lastSync: lastSync ? new Date(lastSync) : null,
        cachedBranchHealth: branchHealth,
      }));

      console.log("[MobileOffline] Loaded cached data:", {
        incidents: incidents.length,
        pendingActions: pendingActions.length,
        lastSync,
      });
    } catch (error) {
      console.error("[MobileOffline] Error loading cached data:", error);
    }
  }, []);

  /**
   * Cache home data
   */
  const cacheHomeData = useCallback(async (homeData: any) => {
    try {
      if (homeData.incidents) {
        await cacheIncidents(homeData.incidents);
      }

      if (homeData.branchHealthSummary) {
        await updateMetadata("branchHealth", homeData.branchHealthSummary);
      }

      await updateMetadata("lastSync", new Date().toISOString());

      setOfflineState((prev) => ({
        ...prev,
        cachedIncidents: homeData.incidents || [],
        cachedBranchHealth: homeData.branchHealthSummary,
        lastSync: new Date(),
      }));

      console.log("[MobileOffline] Cached home data");
    } catch (error) {
      console.error("[MobileOffline] Error caching home data:", error);
    }
  }, []);

  /**
   * Queue action for offline execution
   */
  const queueAction = useCallback(
    async (
      type: PendingAction["type"],
      incidentId: string,
      payload: any
    ): Promise<PendingAction> => {
      const action = await addPendingAction({
        type,
        incidentId,
        payload,
      });

      setOfflineState((prev) => ({
        ...prev,
        pendingActions: [...prev.pendingActions, action],
      }));

      console.log("[MobileOffline] Queued action:", action);

      return action;
    },
    []
  );

  /**
   * Sync pending actions when back online
   */
  const syncPendingActions = useCallback(async () => {
    if (syncInProgressRef.current || !navigator.onLine) {
      return;
    }

    syncInProgressRef.current = true;

    try {
      const actions = await getPendingActions();

      console.log(`[MobileOffline] Syncing ${actions.length} pending actions`);

      for (const action of actions) {
        try {
          let endpoint = "";
          let method = "POST";
          let body: any = action.payload;

          switch (action.type) {
            case "acknowledge":
              endpoint = `/api/mobile/v1/incidents/${action.incidentId}/acknowledge`;
              break;
            case "escalate":
              endpoint = `/api/mobile/v1/incidents/${action.incidentId}/escalate`;
              break;
            case "assign":
              endpoint = `/api/mobile/v1/incidents/${action.incidentId}/assign`;
              break;
            case "note":
              endpoint = `/api/mobile/v1/incidents/${action.incidentId}/notes`;
              break;
          }

          const response = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          if (response.ok) {
            // Action succeeded, remove from queue
            await removePendingAction(action.id);
            console.log(`[MobileOffline] Synced action ${action.id}`);
          } else {
            console.error(`[MobileOffline] Failed to sync action ${action.id}:`, response.status);
            // Could implement retry logic here
          }
        } catch (error) {
          console.error(`[MobileOffline] Error syncing action ${action.id}:`, error);
        }
      }

      // Reload pending actions
      const remainingActions = await getPendingActions();
      setOfflineState((prev) => ({
        ...prev,
        pendingActions: remainingActions,
      }));
    } catch (error) {
      console.error("[MobileOffline] Error during sync:", error);
    } finally {
      syncInProgressRef.current = false;
    }
  }, []);

  /**
   * Execute action (online or queue for offline)
   */
  const executeAction = useCallback(
    async (
      type: PendingAction["type"],
      incidentId: string,
      payload: any
    ): Promise<{ success: boolean; queued: boolean; message?: string }> => {
      if (!navigator.onLine) {
        // Queue for later
        await queueAction(type, incidentId, payload);
        return {
          success: true,
          queued: true,
          message: "Action queued - will sync when online",
        };
      }

      // Execute immediately
      try {
        let endpoint = "";
        switch (type) {
          case "acknowledge":
            endpoint = `/api/mobile/v1/incidents/${incidentId}/acknowledge`;
            break;
          case "escalate":
            endpoint = `/api/mobile/v1/incidents/${incidentId}/escalate`;
            break;
          case "assign":
            endpoint = `/api/mobile/v1/incidents/${incidentId}/assign`;
            break;
          case "note":
            endpoint = `/api/mobile/v1/incidents/${incidentId}/notes`;
            break;
        }

        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await response.json();

        return {
          success: response.ok && data.success,
          queued: false,
          message: data.message,
        };
      } catch (error) {
        // Network error - queue for later
        await queueAction(type, incidentId, payload);
        return {
          success: true,
          queued: true,
          message: "Network error - action queued for later",
        };
      }
    },
    [queueAction]
  );

  /**
   * Clear all cached data
   */
  const clearCache = useCallback(async () => {
    try {
      const db = await openDB();
      const transaction = db.transaction(
        [INCIDENTS_STORE, ACTIONS_STORE, METADATA_STORE],
        "readwrite"
      );

      await transaction.objectStore(INCIDENTS_STORE).clear();
      await transaction.objectStore(ACTIONS_STORE).clear();
      await transaction.objectStore(METADATA_STORE).clear();

      setOfflineState({
        isOnline: navigator.onLine,
        lastSync: null,
        pendingActions: [],
        cachedIncidents: [],
        cachedBranchHealth: null,
      });

      console.log("[MobileOffline] Cache cleared");
    } catch (error) {
      console.error("[MobileOffline] Error clearing cache:", error);
    }
  }, []);

  // Setup online/offline listeners
  useEffect(() => {
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, [updateOnlineStatus]);

  // Load cached data on mount
  useEffect(() => {
    loadCachedData();
  }, [loadCachedData]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (offlineState.isOnline && offlineState.pendingActions.length > 0) {
      console.log("[MobileOffline] Back online - syncing pending actions");
      syncPendingActions();
    }
  }, [offlineState.isOnline, offlineState.pendingActions.length, syncPendingActions]);

  // Periodic sync check
  useEffect(() => {
    if (offlineState.isOnline) {
      syncIntervalRef.current = setInterval(() => {
        if (offlineState.pendingActions.length > 0) {
          syncPendingActions();
        }
      }, 60000); // Check every minute

      return () => {
        if (syncIntervalRef.current) {
          clearInterval(syncIntervalRef.current);
        }
      };
    }
  }, [offlineState.isOnline, offlineState.pendingActions.length, syncPendingActions]);

  return {
    offlineState,
    cacheHomeData,
    executeAction,
    syncPendingActions,
    clearCache,
  };
}
