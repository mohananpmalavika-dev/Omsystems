import { EventEmitter } from "node:events";
import type { EnterpriseStorageHealthState, MediaNodeStorageTarget, StorageFailoverEvent, StorageFailoverReason } from "../domain/models.js";
import type { RecordingStorage, StorageWriteResult } from "./recording-storage.interface.js";
import { enterpriseStoragePool, EnterpriseStoragePool } from "./enterprise-storage-pool.js";

export interface FailoverTargetEntry {
  id: string;
  mediaNodeId: string;
  cameraId?: string;
  storageNodeId: string;
  targetName: string;
  targetPath: string;
  priority: number; // 1 = highest priority
  isActive: boolean;
  healthState: EnterpriseStorageHealthState;
  spilloverThresholdPercent: number;
  consecutiveFailures: number;
  lastFailureReason?: StorageFailoverReason;
  lastErrorDetail?: string;
  lastCheckedAt: Date;
}

export class StorageFailoverRouter extends EventEmitter {
  // Key: `${mediaNodeId}:${cameraId || 'default'}` -> sorted array of targets by priority
  private readonly targetRegistry = new Map<string, FailoverTargetEntry[]>();
  private readonly activeTargetPointer = new Map<string, string>(); // key -> targetId
  private readonly storagePool: EnterpriseStoragePool;

  constructor(storagePool: EnterpriseStoragePool = enterpriseStoragePool) {
    super();
    this.storagePool = storagePool;
  }

  /**
   * Registers or updates a permitted recording target with priority
   */
  registerTarget(target: {
    id?: string;
    mediaNodeId: string;
    cameraId?: string;
    storageNodeId: string;
    targetName: string;
    targetPath: string;
    priority?: number;
    isActive?: boolean;
    spilloverThresholdPercent?: number;
  }): FailoverTargetEntry {
    const routeKey = this.getRouteKey(target.mediaNodeId, target.cameraId);
    const existingList = this.targetRegistry.get(routeKey) || [];

    const entryId = target.id || `target-${target.mediaNodeId}-${target.storageNodeId}`;
    const filtered = existingList.filter((t) => t.id !== entryId);

    const entry: FailoverTargetEntry = {
      id: entryId,
      mediaNodeId: target.mediaNodeId,
      cameraId: target.cameraId,
      storageNodeId: target.storageNodeId,
      targetName: target.targetName,
      targetPath: target.targetPath,
      priority: target.priority ?? (existingList.length + 1),
      isActive: target.isActive ?? true,
      healthState: "HEALTHY",
      spilloverThresholdPercent: target.spilloverThresholdPercent ?? 95,
      consecutiveFailures: 0,
      lastCheckedAt: new Date(),
    };

    filtered.push(entry);
    // Sort ascending by priority (1 is highest)
    filtered.sort((a, b) => a.priority - b.priority);
    this.targetRegistry.set(routeKey, filtered);

    // If no active pointer, default to the top priority
    if (!this.activeTargetPointer.has(routeKey) && filtered.length > 0 && filtered[0]) {
      this.activeTargetPointer.set(routeKey, filtered[0].id);
    }

    return entry;
  }

  /**
   * Gets the list of permitted targets ordered by priority
   */
  getPermittedTargets(mediaNodeId: string, cameraId?: string): FailoverTargetEntry[] {
    const routeKey = this.getRouteKey(mediaNodeId, cameraId);
    const specific = this.targetRegistry.get(routeKey);
    if (specific && specific.length > 0) return [...specific];

    // Fall back to mediaNode default route
    const defaultKey = this.getRouteKey(mediaNodeId, undefined);
    const defaultList = this.targetRegistry.get(defaultKey);
    return defaultList ? [...defaultList] : [];
  }

  /**
   * Selects the currently active healthy storage target for a media node / camera channel
   */
  async getActiveTarget(mediaNodeId: string, cameraId?: string): Promise<FailoverTargetEntry> {
    const targets = this.getPermittedTargets(mediaNodeId, cameraId);
    if (targets.length === 0) {
      // Auto-register default local target if none configured
      const defaultEntry = this.registerTarget({
        mediaNodeId,
        cameraId,
        storageNodeId: "default-local",
        targetName: "Default Local Storage",
        targetPath: `./data/recordings/${mediaNodeId}`,
        priority: 1,
      });
      return defaultEntry;
    }

    const routeKey = this.getRouteKey(mediaNodeId, cameraId);
    const currentActiveId = this.activeTargetPointer.get(routeKey);

    // Check if the current active target is still healthy
    if (currentActiveId) {
      const current = targets.find((t) => t.id === currentActiveId && t.isActive);
      if (current && this.isTargetHealthy(current)) {
        return current;
      }
    }

    // Find the highest-priority healthy target
    for (const target of targets) {
      if (target.isActive && this.isTargetHealthy(target)) {
        this.activeTargetPointer.set(routeKey, target.id);
        return target;
      }
    }

    // If all targets are marked unhealthy, return the first active target with degraded warning
    const fallback = targets.find((t) => t.isActive) || targets[0];
    if (!fallback) {
      throw new Error("No storage targets available");
    }
    this.activeTargetPointer.set(routeKey, fallback.id);
    return fallback;
  }

  /**
   * Reports a failure on a storage target and triggers zero-interruption failover to the next priority target
   */
  async reportTargetFailure(
    mediaNodeId: string,
    targetId: string,
    reason: StorageFailoverReason,
    errorDetail?: string,
    cameraId?: string,
  ): Promise<{ failoverOccurred: boolean; newTarget?: FailoverTargetEntry; event?: StorageFailoverEvent }> {
    const routeKey = this.getRouteKey(mediaNodeId, cameraId);
    const targets = this.getPermittedTargets(mediaNodeId, cameraId);
    const failedTarget = targets.find((t) => t.id === targetId);

    if (failedTarget) {
      failedTarget.consecutiveFailures++;
      failedTarget.lastFailureReason = reason;
      failedTarget.lastErrorDetail = errorDetail;
      failedTarget.lastCheckedAt = new Date();

      if (reason === "DISK_FULL") failedTarget.healthState = "FULL";
      else if (reason === "READ_ONLY") failedTarget.healthState = "READ_ONLY";
      else if (reason === "STORAGE_OFFLINE" || reason === "MOUNT_DISCONNECTED") failedTarget.healthState = "OFFLINE";
      else failedTarget.healthState = "DEGRADED";
    }

    // Find next available healthy target with lowest priority number
    const availableTargets = targets.filter(
      (t) => t.id !== targetId && t.isActive && this.isTargetHealthy(t),
    );

    if (availableTargets.length === 0 || !availableTargets[0]) {
      this.emit("failover:exhausted", {
        mediaNodeId,
        cameraId,
        reason,
        errorDetail,
      });
      return { failoverOccurred: false };
    }

    // Pick top available priority
    const nextTarget = availableTargets[0]!;
    this.activeTargetPointer.set(routeKey, nextTarget.id);

    const event: StorageFailoverEvent = {
      id: `failover-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tenantId: "00000000-0000-0000-0000-000000000000",
      mediaNodeId,
      cameraId,
      fromStorageNodeId: failedTarget?.storageNodeId || targetId,
      fromTargetPath: failedTarget?.targetPath || targetId,
      toStorageNodeId: nextTarget.storageNodeId,
      toTargetPath: nextTarget.targetPath,
      reason,
      errorDetail,
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    this.emit("failover:triggered", event);

    return {
      failoverOccurred: true,
      newTarget: nextTarget,
      event,
    };
  }

  /**
   * Reports that a storage target has recovered and is healthy
   */
  reportTargetRecovered(mediaNodeId: string, targetId: string, cameraId?: string): void {
    const targets = this.getPermittedTargets(mediaNodeId, cameraId);
    const target = targets.find((t) => t.id === targetId);
    if (target) {
      target.healthState = "HEALTHY";
      target.consecutiveFailures = 0;
      target.lastFailureReason = undefined;
      target.lastErrorDetail = undefined;
      target.lastCheckedAt = new Date();

      const routeKey = this.getRouteKey(mediaNodeId, cameraId);
      // If this recovered target has higher priority than current active target, we can restore it
      const currentActiveId = this.activeTargetPointer.get(routeKey);
      const current = targets.find((t) => t.id === currentActiveId);
      if (!current || target.priority < current.priority) {
        this.activeTargetPointer.set(routeKey, target.id);
        this.emit("failover:recovered", {
          mediaNodeId,
          cameraId,
          recoveredTargetId: target.id,
          storageNodeId: target.storageNodeId,
        });
      }
    }
  }

  /**
   * Transparently executes a write operation against the active target.
   * If an I/O error or mount failure occurs, automatically fails over to the next priority target and retries seamlessly.
   */
  async writeSegmentWithFailover(
    mediaNodeId: string,
    key: string,
    data: Buffer,
    cameraId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult & { activeTarget: FailoverTargetEntry }> {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError: any;

    while (attempts < maxAttempts) {
      attempts++;
      const target = await this.getActiveTarget(mediaNodeId, cameraId);

      try {
        const storageNode = this.storagePool.getNode(target.storageNodeId);
        if (!storageNode) {
          // If node not in pool, write directly using pool
          const writeRes = await this.storagePool.writeSegment(key, data, "hot", {
            ...metadata,
            targetPath: target.targetPath,
            mediaNodeId,
          });
          return { ...writeRes, activeTarget: target };
        }

        const writeRes = await storageNode.writeSegment(key, data, {
          ...metadata,
          targetPath: target.targetPath,
          mediaNodeId,
        });

        return { ...writeRes, activeTarget: target };
      } catch (err: any) {
        lastError = err;
        const reason = this.detectFailoverReason(err);
        await this.reportTargetFailure(mediaNodeId, target.id, reason, err.message, cameraId);
      }
    }

    throw new Error(`Write failed after failover attempts: ${lastError?.message || "Unknown error"}`);
  }

  private isTargetHealthy(target: FailoverTargetEntry): boolean {
    return target.healthState === "HEALTHY" || target.healthState === "DEGRADED" || target.healthState === "REBUILDING";
  }

  private getRouteKey(mediaNodeId: string, cameraId?: string): string {
    return `${mediaNodeId}:${cameraId || "default"}`;
  }

  private detectFailoverReason(err: any): StorageFailoverReason {
    const msg = (err?.message || "").toLowerCase();
    const code = err?.code || "";

    if (code === "ENOSPC" || msg.includes("full") || msg.includes("no space")) return "DISK_FULL";
    if (code === "EROFS" || msg.includes("read-only") || msg.includes("read_only")) return "READ_ONLY";
    if (code === "ENOENT" || code === "EBUSY" || msg.includes("unreachable") || msg.includes("offline")) return "STORAGE_OFFLINE";
    if (code === "ESTALE" || msg.includes("stale")) return "MOUNT_DISCONNECTED";
    if (msg.includes("timeout") || msg.includes("latency")) return "LATENCY_SPIKE";
    return "WRITE_FAILURE";
  }
}

export const storageFailoverRouter = new StorageFailoverRouter();
