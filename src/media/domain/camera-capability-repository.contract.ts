import type { CameraCapabilitiesDurable } from "./distributed-lease.types.js";

export interface CameraCapabilityRepository {
  /**
   * Get durable capabilities for a camera with 3-tier lookup:
   * 1. Process-local Map Cache (<1ms)
   * 2. Redis Distributed Cache (~1-2ms)
   * 3. PostgreSQL Authoritative Database (~5ms)
   */
  getCapabilities(cameraId: string): Promise<CameraCapabilitiesDurable | null>;

  /**
   * Persist durable camera capabilities in PostgreSQL and invalidate / update caches.
   */
  saveCapabilities(capabilities: CameraCapabilitiesDurable): Promise<void>;

  /**
   * Explicitly invalidate the cache across cluster instances when camera settings change.
   */
  invalidateCache(cameraId: string): Promise<void>;
}
