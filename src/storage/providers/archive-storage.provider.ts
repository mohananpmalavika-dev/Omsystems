import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import type { EnterpriseStorageHealthState, EnterpriseStorageType } from "../../domain/models.js";
import type {
  RecordingStorage,
  StorageHealthStatus,
  StorageReadOptions,
  StorageTier,
  StorageWriteResult,
} from "../recording-storage.interface.js";

export type ArchiveMedium = "glacier" | "tape-vtl" | "cold-object" | "offline-disk";
export type ArchiveRestoreStatus = "ARCHIVED" | "RESTORING" | "RESTORED";

export interface ArchiveStorageOptions {
  nodeId: string;
  vaultOrBucketName: string;
  medium?: ArchiveMedium;
  endpoint?: string;
  simulatedCapacityBytes?: number;
  simulatedUsedBytes?: number;
  forceOffline?: boolean;
}

export class ArchiveStorageProvider implements RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType = "archive";
  readonly storageTier: StorageTier = "archive";
  readonly mountOrBucketUri: string;
  readonly vaultOrBucketName: string;
  readonly medium: ArchiveMedium;
  readonly endpoint: string;

  private readonly archiveStore = new Map<
    string,
    {
      data: Buffer;
      sha256: string;
      archivedAt: Date;
      restoreStatus: ArchiveRestoreStatus;
      restoredUntil?: Date;
      metadata?: Record<string, unknown>;
    }
  >();

  private totalWrites = 0;
  private failedWrites = 0;
  private corruptedSegments = 0;
  private writeLatencies: number[] = [];
  private readLatencies: number[] = [];

  private forceOffline: boolean;
  private simulatedCapacityBytes: number;
  private simulatedUsedBytes: number;

  constructor(options: ArchiveStorageOptions) {
    this.nodeId = options.nodeId;
    this.vaultOrBucketName = options.vaultOrBucketName;
    this.medium = options.medium || "glacier";
    this.endpoint = options.endpoint || "vault.archive.local";
    this.mountOrBucketUri = `archive://${this.medium}/${this.vaultOrBucketName}`;
    this.forceOffline = options.forceOffline || false;
    this.simulatedCapacityBytes = options.simulatedCapacityBytes ?? 10_000_000_000_000_000; // 10 Petabytes
    this.simulatedUsedBytes = options.simulatedUsedBytes ?? 1_200_000_000_000_000;
  }

  setForceOffline(offline: boolean): void {
    this.forceOffline = offline;
  }

  async writeSegment(
    key: string,
    data: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult> {
    if (this.forceOffline) {
      this.failedWrites++;
      throw new Error(`Archive Storage [${this.nodeId}] is OFFLINE`);
    }

    const start = performance.now();
    this.totalWrites++;

    try {
      let buffer: Buffer;
      if (Buffer.isBuffer(data)) {
        buffer = data;
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of data) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        buffer = Buffer.concat(chunks);
      }

      const sha256 = createHash("sha256").update(buffer).digest("hex");
      this.archiveStore.set(key, {
        data: buffer,
        sha256,
        archivedAt: new Date(),
        restoreStatus: "ARCHIVED",
        metadata,
      });
      this.simulatedUsedBytes += buffer.length;

      const latency = performance.now() - start;
      this.writeLatencies.push(latency);

      return {
        key,
        uri: `${this.mountOrBucketUri}/${key}`,
        bytesWritten: buffer.length,
        sha256,
        writeLatencyMs: Math.round(latency * 100) / 100,
        checksum: sha256,
        metadata: {
          ...metadata,
          archiveMedium: this.medium,
          restoreRequired: true,
        },
      };
    } catch (err) {
      this.failedWrites++;
      throw err;
    }
  }

  /**
   * Request async restoration of an archived segment
   */
  async requestRestore(key: string, validityDays = 7): Promise<{ status: ArchiveRestoreStatus; etaMinutes: number }> {
    const entry = this.archiveStore.get(key);
    if (!entry) throw new Error(`Archive segment [${key}] not found`);

    // Simulate instant or fast test restoration
    entry.restoreStatus = "RESTORED";
    entry.restoredUntil = new Date(Date.now() + validityDays * 24 * 3600 * 1000);

    return {
      status: "RESTORED",
      etaMinutes: 0,
    };
  }

  async readSegment(
    key: string,
    range?: StorageReadOptions,
  ): Promise<Readable | Buffer> {
    if (this.forceOffline) throw new Error(`Archive Storage [${this.nodeId}] is OFFLINE`);

    const entry = this.archiveStore.get(key);
    if (!entry) throw new Error(`Archive segment [${key}] not found`);

    if (entry.restoreStatus !== "RESTORED") {
      throw new Error(`ArchiveRestoreRequired: Segment [${key}] is currently in ${entry.restoreStatus} state. Request restore first.`);
    }

    const start = performance.now();
    const latency = performance.now() - start;
    this.readLatencies.push(latency);

    if (range && (range.start !== undefined || range.end !== undefined)) {
      const startOffset = range.start ?? 0;
      const endOffset = range.end !== undefined ? range.end + 1 : entry.data.length;
      return Readable.from(entry.data.subarray(startOffset, endOffset));
    }

    return entry.data;
  }

  async deleteSegment(key: string): Promise<void> {
    if (this.forceOffline) throw new Error(`Archive [${this.nodeId}] is OFFLINE`);
    const existing = this.archiveStore.get(key);
    if (existing) {
      this.simulatedUsedBytes = Math.max(0, this.simulatedUsedBytes - existing.data.length);
      this.archiveStore.delete(key);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.forceOffline) return false;
    return this.archiveStore.has(key);
  }

  async health(): Promise<StorageHealthStatus> {
    const now = new Date();
    const warnings: string[] = [];
    const errors: string[] = [];

    if (this.forceOffline) {
      return {
        nodeId: this.nodeId,
        storageType: this.storageType,
        storageTier: this.storageTier,
        healthState: "OFFLINE",
        capacityBytes: 0,
        usedBytes: 0,
        availableBytes: 0,
        usagePercent: 0,
        writeLatencyMs: 0,
        readLatencyMs: 0,
        p95WriteLatencyMs: 0,
        p95ReadLatencyMs: 0,
        readIops: 0,
        writeIops: 0,
        totalIops: 0,
        totalWritesAttempted: this.totalWrites,
        failedWritesCount: this.failedWrites,
        corruptedSegmentsCount: this.corruptedSegments,
        segmentFailureRate: this.calculateFailureRate(),
        lastCheckedAt: now,
        warnings: [`Archive vault ${this.vaultOrBucketName} offline`],
        errors: ["Tape VTL drive offline / Glacier access denied"],
      };
    }

    const available = Math.max(0, this.simulatedCapacityBytes - this.simulatedUsedBytes);
    const usagePercent = Math.round((this.simulatedUsedBytes / this.simulatedCapacityBytes) * 10000) / 100;

    const avgWrite = this.writeLatencies.length > 0
      ? this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length
      : 0;

    return {
      nodeId: this.nodeId,
      storageType: this.storageType,
      storageTier: this.storageTier,
      healthState: "HEALTHY",
      capacityBytes: this.simulatedCapacityBytes,
      usedBytes: this.simulatedUsedBytes,
      availableBytes: available,
      usagePercent,
      writeLatencyMs: Math.round(avgWrite * 100) / 100,
      readLatencyMs: 0,
      p95WriteLatencyMs: Math.round(avgWrite * 1.2 * 100) / 100,
      p95ReadLatencyMs: 0,
      readIops: 0,
      writeIops: 0,
      totalIops: 0,
      totalWritesAttempted: this.totalWrites,
      failedWritesCount: this.failedWrites,
      corruptedSegmentsCount: this.corruptedSegments,
      segmentFailureRate: this.calculateFailureRate(),
      filesystem: {
        filesystemType: `Archive (${this.medium.toUpperCase()})`,
        mountPath: this.mountOrBucketUri,
        isReadOnly: false,
      },
      lastCheckedAt: now,
      warnings,
      errors,
    };
  }

  private calculateFailureRate(): number {
    if (this.totalWrites === 0) return 0;
    return Math.round((this.failedWrites / this.totalWrites) * 10000) / 10000;
  }
}
