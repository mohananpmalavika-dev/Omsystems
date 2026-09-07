import { randomUUID } from "node:crypto";

export type SegmentSyncStatus = "PENDING" | "SYNCING" | "SYNCED" | "FAILED";

export interface EdgeSegmentEntry {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationMs: number;
  fileSize: number;
  sha256: string;
  storagePath: string;
  frameCount?: number;
  keyframeTimestamps?: string[];
  syncStatus: SegmentSyncStatus;
  createdAt: string;
  syncedAt?: string;
  retryCount: number;
}

export interface JournalConfig {
  maxStorageBytes?: number;
  retentionDays?: number;
}

/**
 * EdgeStoreForwardJournal
 * 
 * Embedded edge recording journal for autonomous 30-day recording buffering
 * during total WAN isolation. Enforces zero data loss and smart FIFO pruning.
 */
export class EdgeStoreForwardJournal {
  private entries: Map<string, EdgeSegmentEntry> = new Map();
  private readonly maxStorageBytes: number;
  private readonly retentionDays: number;

  constructor(config: JournalConfig = {}) {
    this.maxStorageBytes = config.maxStorageBytes ?? 100 * 1024 * 1024 * 1024; // Default 100 GB
    this.retentionDays = config.retentionDays ?? 30; // 30 days buffer
  }

  /**
   * Registers a newly finalized local video recording segment
   */
  public registerSegment(input: {
    id?: string;
    tenantId: string;
    branchId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    durationMs: number;
    fileSize: number;
    sha256: string;
    storagePath: string;
    frameCount?: number;
    keyframeTimestamps?: string[];
  }): EdgeSegmentEntry {
    const entry: EdgeSegmentEntry = {
      id: input.id || randomUUID(),
      tenantId: input.tenantId,
      branchId: input.branchId,
      cameraId: input.cameraId,
      startTime: input.startTime,
      endTime: input.endTime,
      durationMs: input.durationMs,
      fileSize: input.fileSize,
      sha256: input.sha256,
      storagePath: input.storagePath,
      frameCount: input.frameCount,
      keyframeTimestamps: input.keyframeTimestamps,
      syncStatus: "PENDING",
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    this.entries.set(entry.id, entry);
    this.enforceRetentionAndQuota();
    return entry;
  }

  /**
   * Retrieves all segments waiting to be backfilled to central catalog
   */
  public getPendingSyncSegments(cameraId?: string): EdgeSegmentEntry[] {
    const pending: EdgeSegmentEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.syncStatus === "PENDING" || entry.syncStatus === "FAILED") {
        if (!cameraId || entry.cameraId === cameraId) {
          pending.push(entry);
        }
      }
    }
    return pending.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  /**
   * Marks segments as successfully synchronized with central catalog
   */
  public markSegmentsSynced(segmentIds: string[]): void {
    const now = new Date().toISOString();
    for (const id of segmentIds) {
      const entry = this.entries.get(id);
      if (entry) {
        entry.syncStatus = "SYNCED";
        entry.syncedAt = now;
      }
    }
  }

  /**
   * Marks a segment as failed with incremented retry count
   */
  public markSegmentFailed(segmentId: string): void {
    const entry = this.entries.get(segmentId);
    if (entry) {
      entry.syncStatus = "FAILED";
      entry.retryCount++;
    }
  }

  /**
   * Returns current journal inventory statistics
   */
  public getStats() {
    let totalBytes = 0;
    let pendingCount = 0;
    let syncedCount = 0;
    let failedCount = 0;

    for (const entry of this.entries.values()) {
      totalBytes += entry.fileSize;
      if (entry.syncStatus === "PENDING") pendingCount++;
      else if (entry.syncStatus === "SYNCED") syncedCount++;
      else if (entry.syncStatus === "FAILED") failedCount++;
    }

    return {
      totalSegments: this.entries.size,
      totalBytes,
      pendingCount,
      syncedCount,
      failedCount,
      utilizationPercent: Math.min(100, (totalBytes / this.maxStorageBytes) * 100),
    };
  }

  /**
   * Smart FIFO pruning:
   * 1. Prunes 'SYNCED' segments older than retentionDays or when approaching storage capacity.
   * 2. NEVER prunes 'PENDING' segments unless hard disk emergency ceiling is breached.
   */
  private enforceRetentionAndQuota(): void {
    const nowMs = Date.now();
    const retentionCutoffMs = nowMs - this.retentionDays * 86400 * 1000;

    // Phase 1: Prune SYNCED segments older than retention cutoff
    for (const [id, entry] of this.entries.entries()) {
      if (entry.syncStatus === "SYNCED") {
        const startMs = new Date(entry.startTime).getTime();
        if (startMs < retentionCutoffMs) {
          this.entries.delete(id);
        }
      }
    }

    // Phase 2: If total storage exceeds maxStorageBytes, prune oldest SYNCED segments
    let currentBytes = 0;
    for (const entry of this.entries.values()) {
      currentBytes += entry.fileSize;
    }

    if (currentBytes > this.maxStorageBytes) {
      const sortedSynced = Array.from(this.entries.values())
        .filter((e) => e.syncStatus === "SYNCED")
        .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      for (const entry of sortedSynced) {
        this.entries.delete(entry.id);
        currentBytes -= entry.fileSize;
        if (currentBytes <= this.maxStorageBytes * 0.85) {
          break; // Free up to 15% headroom
        }
      }
    }
  }
}
