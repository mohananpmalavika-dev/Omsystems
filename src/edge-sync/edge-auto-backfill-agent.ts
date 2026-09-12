/**
 * Edge Auto Backfill Agent
 * 
 * Autonomous edge sync engine that triggers automatic backfill of store-and-forward
 * local recordings upon WAN network reconnection.
 */

import { EventEmitter } from "node:events";
import type { WANStatusMonitor } from "./wan-status-monitor.js";
import type { EdgeStoreForwardJournal, EdgeSegmentEntry } from "./edge-store-forward-journal.js";

export interface EdgeAutoBackfillConfig {
  centralSyncEndpoint?: string; // e.g. http://control-plane:3000/v1/recording/recovery/backfill/upload
  authToken?: string;
  batchSize?: number;
  rateLimitKbps?: number;
  retryMaxAttempts?: number;
  customUploader?: (segment: EdgeSegmentEntry) => Promise<{
    action: "SYNCHRONIZED" | "SKIPPED_DUPLICATE" | "OVERLAP_RECONCILED" | "FAILED";
    message?: string;
  }>;
}

export class EdgeAutoBackfillAgent extends EventEmitter {
  private isSyncing = false;
  private syncTimer?: NodeJS.Timeout;
  private readonly batchSize: number;
  private readonly rateLimitKbps: number;
  private readonly retryMaxAttempts: number;

  constructor(
    private readonly wanMonitor: WANStatusMonitor,
    private readonly journal: EdgeStoreForwardJournal,
    private readonly config: EdgeAutoBackfillConfig = {}
  ) {
    super();
    this.batchSize = config.batchSize ?? 10;
    this.rateLimitKbps = config.rateLimitKbps ?? 0; // 0 = unthrottled
    this.retryMaxAttempts = config.retryMaxAttempts ?? 5;

    // Listen for WAN link restoration
    this.wanMonitor.on("wan_recovered", (evt) => {
      this.emit("wan_recovery_detected", evt);
      void this.triggerBackfill("AUTO_WAN_RECOVERY");
    });
  }

  public getIsSyncing(): boolean {
    return this.isSyncing;
  }

  /**
   * Starts periodic sync checker alongside event-driven WAN recovery
   */
  public start(pollIntervalMs = 30000): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      if (this.wanMonitor.isOnline() && !this.isSyncing) {
        const pending = this.journal.getPendingSyncSegments();
        if (pending.length > 0) {
          void this.triggerBackfill("PERIODIC_POLL");
        }
      }
    }, pollIntervalMs);

    if (this.syncTimer.unref) {
      this.syncTimer.unref();
    }
  }

  public stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Initiates backfill transfer of all pending offline segments to central storage
   */
  public async triggerBackfill(triggerReason = "MANUAL"): Promise<{
    totalProcessed: number;
    syncedCount: number;
    skippedCount: number;
    failedCount: number;
    processedBytes: number;
  }> {
    if (this.isSyncing) {
      this.emit("sync_skipped", { reason: "Sync already in progress" });
      return { totalProcessed: 0, syncedCount: 0, skippedCount: 0, failedCount: 0, processedBytes: 0 };
    }

    if (!this.wanMonitor.isOnline()) {
      this.emit("sync_skipped", { reason: "WAN is currently offline/isolated" });
      return { totalProcessed: 0, syncedCount: 0, skippedCount: 0, failedCount: 0, processedBytes: 0 };
    }

    this.isSyncing = true;
    this.emit("sync_started", { triggerReason, startedAt: new Date().toISOString() });

    const stats = {
      totalProcessed: 0,
      syncedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      processedBytes: 0,
    };

    try {
      const pending = this.journal.getPendingSyncSegments();
      stats.totalProcessed = pending.length;

      for (let i = 0; i < pending.length; i += this.batchSize) {
        // Re-check WAN state in case network dropped midway
        if (!this.wanMonitor.isOnline()) {
          this.emit("sync_interrupted", { reason: "WAN dropped during backfill", processedSoFar: stats });
          break;
        }

        const batch = pending.slice(i, i + this.batchSize);

        for (const seg of batch) {
          try {
            const uploadResult = await this.uploadSegment(seg);

            if (uploadResult.action === "SYNCHRONIZED" || uploadResult.action === "OVERLAP_RECONCILED") {
              this.journal.markSegmentsSynced([seg.id]);
              stats.syncedCount++;
              stats.processedBytes += seg.fileSize;
              this.emit("segment_synced", { segmentId: seg.id, action: uploadResult.action });
            } else if (uploadResult.action === "SKIPPED_DUPLICATE") {
              this.journal.markSegmentsSynced([seg.id]);
              stats.skippedCount++;
              this.emit("segment_skipped", { segmentId: seg.id, reason: "Duplicate" });
            } else {
              this.journal.markSegmentFailed(seg.id);
              stats.failedCount++;
              this.emit("segment_failed", { segmentId: seg.id, error: uploadResult.message });
            }
          } catch (err: any) {
            this.journal.markSegmentFailed(seg.id);
            stats.failedCount++;
            this.emit("segment_failed", { segmentId: seg.id, error: err?.message });
          }

          // Apply bandwidth rate limiting pacing if configured
          if (this.rateLimitKbps > 0) {
            const sleepMs = Math.round((seg.fileSize * 8) / (this.rateLimitKbps * 1024) * 1000);
            if (sleepMs > 5 && sleepMs < 2000) {
              await new Promise((res) => setTimeout(res, sleepMs));
            }
          }
        }
      }

      this.emit("sync_completed", { ...stats, completedAt: new Date().toISOString() });
    } finally {
      this.isSyncing = false;
    }

    return stats;
  }

  /**
   * Dispatches upload via customUploader or HTTP POST to central REST endpoint
   */
  private async uploadSegment(segment: EdgeSegmentEntry): Promise<{
    action: "SYNCHRONIZED" | "SKIPPED_DUPLICATE" | "OVERLAP_RECONCILED" | "FAILED";
    message?: string;
  }> {
    if (this.config.customUploader) {
      return this.config.customUploader(segment);
    }

    if (!this.config.centralSyncEndpoint) {
      // Nominal fallback for standalone mode
      return { action: "SYNCHRONIZED", message: "Processed via local edge pipeline" };
    }

    const payload = {
      segmentId: segment.id,
      tenantId: segment.tenantId,
      branchId: segment.branchId,
      cameraId: segment.cameraId,
      startTime: segment.startTime,
      endTime: segment.endTime,
      durationMs: segment.durationMs,
      fileSize: segment.fileSize,
      sha256: segment.sha256,
      storagePath: segment.storagePath,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.authToken) {
      headers["Authorization"] = `Bearer ${this.config.authToken}`;
    }

    const response = await fetch(this.config.centralSyncEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Upload failed HTTP ${response.status}: ${errText}`);
    }

    const json = (await response.json()) as any;
    const data = json.data || json;
    return {
      action: data.action || "SYNCHRONIZED",
      message: data.message,
    };
  }
}
