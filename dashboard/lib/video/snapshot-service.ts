/**
 * Snapshot Service
 * 
 * Provides periodic JPEG snapshots for cameras not in the live decoder pool.
 * Reduces bandwidth and CPU usage while maintaining visual awareness.
 */

import type { CameraPriorityClass } from "./types";

// ============================================================================
// CONFIGURATION
// ============================================================================

const SNAPSHOT_INTERVALS: Record<CameraPriorityClass, number> = {
  P0_OPERATOR_PINNED: 1000,  // 1s (shouldn't be snapshot, but fallback)
  P1_CRITICAL: 2000,         // 2s
  P2_HIGH: 3000,             // 3s
  P3_INCIDENT: 5000,         // 5s
  P4_VISIBLE: 10000,         // 10s
  P5_ROTATION: 15000,        // 15s
  P6_BACKGROUND: 30000,      // 30s
};

// ============================================================================
// SNAPSHOT SERVICE
// ============================================================================

export interface SnapshotMetadata {
  cameraId: string;
  url: string;
  timestamp: number;
  priority: CameraPriorityClass;
  width?: number;
  height?: number;
}

export interface SnapshotServiceCallbacks {
  onSnapshotReceived?: (metadata: SnapshotMetadata) => void;
  onSnapshotError?: (cameraId: string, error: Error) => void;
}

export class SnapshotService {
  private snapshots: Map<string, SnapshotMetadata> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private callbacks: SnapshotServiceCallbacks;
  private baseUrl: string;

  constructor(baseUrl: string, callbacks: SnapshotServiceCallbacks = {}) {
    this.baseUrl = baseUrl;
    this.callbacks = callbacks;
  }

  /**
   * Start snapshot updates for a camera
   */
  startSnapshot(
    cameraId: string,
    priority: CameraPriorityClass,
    customIntervalMs?: number
  ): void {
    // Clear existing interval if any
    this.stopSnapshot(cameraId);

    const intervalMs = customIntervalMs || SNAPSHOT_INTERVALS[priority];

    console.log(`[SnapshotService] Starting snapshots for ${cameraId} every ${intervalMs}ms`);

    // Immediate first snapshot
    this.fetchSnapshot(cameraId, priority);

    // Set up recurring snapshots
    const interval = setInterval(() => {
      this.fetchSnapshot(cameraId, priority);
    }, intervalMs);

    this.intervals.set(cameraId, interval);
  }

  /**
   * Stop snapshot updates for a camera
   */
  stopSnapshot(cameraId: string): void {
    const interval = this.intervals.get(cameraId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(cameraId);
      console.log(`[SnapshotService] Stopped snapshots for ${cameraId}`);
    }
  }

  /**
   * Get latest snapshot for a camera
   */
  getSnapshot(cameraId: string): SnapshotMetadata | undefined {
    return this.snapshots.get(cameraId);
  }

  /**
   * Get all snapshots
   */
  getAllSnapshots(): Map<string, SnapshotMetadata> {
    return new Map(this.snapshots);
  }

  /**
   * Update snapshot interval for a camera
   */
  updateInterval(cameraId: string, priority: CameraPriorityClass): void {
    if (this.intervals.has(cameraId)) {
      this.startSnapshot(cameraId, priority);
    }
  }

  /**
   * Stop all snapshot updates
   */
  stopAll(): void {
    console.log(`[SnapshotService] Stopping all ${this.intervals.size} snapshot streams`);
    
    for (const cameraId of this.intervals.keys()) {
      this.stopSnapshot(cameraId);
    }
    
    this.snapshots.clear();
  }

  /**
   * Get active snapshot count
   */
  getActiveCount(): number {
    return this.intervals.size;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Fetch a snapshot from the server
   */
  private async fetchSnapshot(
    cameraId: string,
    priority: CameraPriorityClass
  ): Promise<void> {
    try {
      const url = `${this.baseUrl}/cameras/${cameraId}/snapshot?t=${Date.now()}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'image/jpeg',
        },
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Revoke old URL if exists
      const oldSnapshot = this.snapshots.get(cameraId);
      if (oldSnapshot?.url) {
        URL.revokeObjectURL(oldSnapshot.url);
      }

      // Store new snapshot
      const metadata: SnapshotMetadata = {
        cameraId,
        url: objectUrl,
        timestamp: Date.now(),
        priority,
      };

      this.snapshots.set(cameraId, metadata);
      this.callbacks.onSnapshotReceived?.(metadata);

    } catch (error) {
      console.error(`[SnapshotService] Error fetching snapshot for ${cameraId}:`, error);
      this.callbacks.onSnapshotError?.(cameraId, error as Error);
    }
  }
}

// ============================================================================
// FALLBACK: CLIENT-SIDE SNAPSHOT EXTRACTION
// ============================================================================

/**
 * Extract snapshot from video element (fallback when server snapshots unavailable)
 */
export function extractVideoSnapshot(
  videoElement: HTMLVideoElement,
  maxWidth: number = 640,
  maxHeight: number = 360
): string | null {
  try {
    const canvas = document.createElement('canvas');
    
    // Scale to target size
    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
    let width = maxWidth;
    let height = maxHeight;
    
    if (aspectRatio > maxWidth / maxHeight) {
      height = Math.round(width / aspectRatio);
    } else {
      width = Math.round(height * aspectRatio);
    }
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    
    ctx.drawImage(videoElement, 0, 0, width, height);
    
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (error) {
    console.error('[SnapshotService] Error extracting video snapshot:', error);
    return null;
  }
}

/**
 * Create snapshot cache that periodically captures from video elements
 */
export class VideoSnapshotCache {
  private cache: Map<string, string> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Start caching snapshots from a video element
   */
  startCaching(
    cameraId: string,
    videoElement: HTMLVideoElement,
    intervalMs: number = 5000
  ): void {
    this.stopCaching(cameraId);

    const captureSnapshot = () => {
      const snapshot = extractVideoSnapshot(videoElement);
      if (snapshot) {
        // Revoke old URL
        const oldUrl = this.cache.get(cameraId);
        if (oldUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(oldUrl);
        }
        
        this.cache.set(cameraId, snapshot);
      }
    };

    // Immediate capture
    captureSnapshot();

    // Recurring capture
    const interval = setInterval(captureSnapshot, intervalMs);
    this.intervals.set(cameraId, interval);
  }

  /**
   * Stop caching for a camera
   */
  stopCaching(cameraId: string): void {
    const interval = this.intervals.get(cameraId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(cameraId);
    }

    // Revoke URL
    const url = this.cache.get(cameraId);
    if (url?.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
    this.cache.delete(cameraId);
  }

  /**
   * Get cached snapshot
   */
  getSnapshot(cameraId: string): string | undefined {
    return this.cache.get(cameraId);
  }

  /**
   * Clear all cached snapshots
   */
  clear(): void {
    for (const cameraId of this.intervals.keys()) {
      this.stopCaching(cameraId);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

let snapshotServiceInstance: SnapshotService | null = null;
let snapshotCacheInstance: VideoSnapshotCache | null = null;

export function getSnapshotService(
  baseUrl?: string,
  callbacks?: SnapshotServiceCallbacks
): SnapshotService {
  if (!snapshotServiceInstance && baseUrl) {
    snapshotServiceInstance = new SnapshotService(baseUrl, callbacks);
  }
  if (!snapshotServiceInstance) {
    throw new Error('SnapshotService not initialized. Provide baseUrl on first call.');
  }
  return snapshotServiceInstance;
}

export function getVideoSnapshotCache(): VideoSnapshotCache {
  if (!snapshotCacheInstance) {
    snapshotCacheInstance = new VideoSnapshotCache();
  }
  return snapshotCacheInstance;
}

export function resetSnapshotServices(): void {
  if (snapshotServiceInstance) {
    snapshotServiceInstance.stopAll();
    snapshotServiceInstance = null;
  }
  if (snapshotCacheInstance) {
    snapshotCacheInstance.clear();
    snapshotCacheInstance = null;
  }
}
