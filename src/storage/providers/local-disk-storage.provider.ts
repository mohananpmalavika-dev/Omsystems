import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { EnterpriseStorageHealthState, EnterpriseStorageType } from "../../domain/models.js";
import type {
  FilesystemTelemetry,
  RaidTelemetry,
  RecordingStorage,
  SmartTelemetry,
  StorageHealthStatus,
  StorageReadOptions,
  StorageTier,
  StorageWriteResult,
} from "../recording-storage.interface.js";

export interface LocalDiskStorageOptions {
  nodeId: string;
  basePath: string;
  storageTier?: StorageTier;
  simulatedCapacityBytes?: number;
  simulatedUsedBytes?: number;
  mockSmart?: SmartTelemetry;
  mockRaid?: RaidTelemetry;
  mockFilesystemType?: string;
  forceReadOnly?: boolean;
  forceOffline?: boolean;
}

export class LocalDiskStorageProvider implements RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType = "local-disk";
  readonly storageTier: StorageTier;
  readonly mountOrBucketUri: string;
  private readonly basePath: string;

  // Telemetry metrics
  private totalWrites = 0;
  private failedWrites = 0;
  private corruptedSegments = 0;
  private writeLatencies: number[] = [];
  private readLatencies: number[] = [];
  private readIopsCounter = 0;
  private writeIopsCounter = 0;
  private lastIopsReset = Date.now();

  private mockSmart?: SmartTelemetry;
  private mockRaid?: RaidTelemetry;
  private mockFilesystemType: string;
  private forceReadOnly: boolean;
  private forceOffline: boolean;
  private simulatedCapacityBytes?: number;
  private simulatedUsedBytes?: number;

  constructor(options: LocalDiskStorageOptions) {
    this.nodeId = options.nodeId;
    this.basePath = resolve(options.basePath);
    this.mountOrBucketUri = `file://${this.basePath.replace(/\\/g, "/")}`;
    this.storageTier = options.storageTier || "hot";
    this.mockSmart = options.mockSmart;
    this.mockRaid = options.mockRaid;
    this.mockFilesystemType = options.mockFilesystemType || "ext4";
    this.forceReadOnly = options.forceReadOnly || false;
    this.forceOffline = options.forceOffline || false;
    this.simulatedCapacityBytes = options.simulatedCapacityBytes;
    this.simulatedUsedBytes = options.simulatedUsedBytes;
  }

  setForceReadOnly(readOnly: boolean): void {
    this.forceReadOnly = readOnly;
  }

  setForceOffline(offline: boolean): void {
    this.forceOffline = offline;
  }

  setMockSmart(smart?: SmartTelemetry): void {
    this.mockSmart = smart;
  }

  setMockRaid(raid?: RaidTelemetry): void {
    this.mockRaid = raid;
  }

  setSimulatedUsage(capacityBytes: number, usedBytes: number): void {
    this.simulatedCapacityBytes = capacityBytes;
    this.simulatedUsedBytes = usedBytes;
  }

  async writeSegment(
    key: string,
    data: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult> {
    if (this.forceOffline) {
      this.failedWrites++;
      throw new Error(`Storage node [${this.nodeId}] is OFFLINE`);
    }
    if (this.forceReadOnly) {
      this.failedWrites++;
      throw new Error(`Storage node [${this.nodeId}] is READ_ONLY`);
    }

    const start = performance.now();
    this.totalWrites++;
    this.writeIopsCounter++;

    const targetPath = join(this.basePath, key);
    const tempPath = `${targetPath}.partial.${Date.now()}`;
    await mkdir(dirname(targetPath), { recursive: true });

    try {
      const hasher = createHash("sha256");
      let bytesWritten = 0;

      if (Buffer.isBuffer(data)) {
        hasher.update(data);
        bytesWritten = data.length;
        await writeFile(tempPath, data);
      } else {
        const outStream = createWriteStream(tempPath);
        data.on("data", (chunk) => {
          hasher.update(chunk);
          bytesWritten += chunk.length;
        });
        await pipeline(data, outStream);
      }

      // Atomic rename from .partial to finalized file
      await rename(tempPath, targetPath);

      const latency = performance.now() - start;
      this.writeLatencies.push(latency);
      if (this.writeLatencies.length > 500) this.writeLatencies.shift();

      const sha256 = hasher.digest("hex");

      return {
        key,
        uri: `recording://${this.nodeId}/${key.replace(/\\/g, "/")}`,
        bytesWritten,
        sha256,
        writeLatencyMs: Math.round(latency * 100) / 100,
        checksum: sha256,
        metadata,
      };
    } catch (err: unknown) {
      this.failedWrites++;
      try {
        await unlink(tempPath);
      } catch {
        // ignore cleanup error
      }
      throw err;
    }
  }

  async readSegment(
    key: string,
    range?: StorageReadOptions,
  ): Promise<Readable | Buffer> {
    if (this.forceOffline) {
      throw new Error(`Storage node [${this.nodeId}] is OFFLINE`);
    }

    const start = performance.now();
    this.readIopsCounter++;
    const targetPath = join(this.basePath, key);

    try {
      if (range && (range.start !== undefined || range.end !== undefined)) {
        const stream = createReadStream(targetPath, {
          start: range.start,
          end: range.end,
        });
        const latency = performance.now() - start;
        this.readLatencies.push(latency);
        if (this.readLatencies.length > 500) this.readLatencies.shift();
        return stream;
      }

      const buffer = await readFile(targetPath);
      const latency = performance.now() - start;
      this.readLatencies.push(latency);
      if (this.readLatencies.length > 500) this.readLatencies.shift();
      return buffer;
    } catch (err) {
      throw new Error(`Failed to read segment [${key}] on node [${this.nodeId}]: ${String(err)}`);
    }
  }

  async deleteSegment(key: string): Promise<void> {
    if (this.forceOffline) {
      throw new Error(`Storage node [${this.nodeId}] is OFFLINE`);
    }
    if (this.forceReadOnly) {
      throw new Error(`Storage node [${this.nodeId}] is READ_ONLY`);
    }

    const targetPath = join(this.basePath, key);
    try {
      await unlink(targetPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.forceOffline) return false;
    const targetPath = join(this.basePath, key);
    try {
      const s = await stat(targetPath);
      return s.isFile();
    } catch {
      return false;
    }
  }

  async health(): Promise<StorageHealthStatus> {
    const now = new Date();
    const warnings: string[] = [];
    const errors: string[] = [];

    // Offline check
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
        warnings: ["Node marked offline"],
        errors: ["Storage mount or host is unreachable"],
      };
    }

    // Capacity calculation
    let capacity = this.simulatedCapacityBytes ?? 1_000_000_000_000; // default 1TB
    let used = this.simulatedUsedBytes ?? 200_000_000_000;
    let available = Math.max(0, capacity - used);

    try {
      const stats = await statfs(this.basePath);
      if (stats.bsize && stats.blocks && !this.simulatedCapacityBytes) {
        capacity = stats.bsize * stats.blocks;
        available = stats.bsize * stats.bavail;
        used = capacity - available;
      }
    } catch {
      // Fall back to simulated or default
    }

    const usagePercent = capacity > 0 ? Math.round((used / capacity) * 10000) / 100 : 0;
    const isFull = usagePercent >= 95;
    if (isFull) {
      warnings.push(`Storage node is at ${usagePercent}% capacity`);
    }

    // Latencies calculation
    const avgWriteLatency = this.writeLatencies.length > 0
      ? this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length
      : 0;
    const avgReadLatency = this.readLatencies.length > 0
      ? this.readLatencies.reduce((a, b) => a + b, 0) / this.readLatencies.length
      : 0;
    const p95Write = this.calculateP95(this.writeLatencies);
    const p95Read = this.calculateP95(this.readLatencies);

    // IOPS calculation (per second)
    const elapsedSec = Math.max(1, (Date.now() - this.lastIopsReset) / 1000);
    const writeIops = Math.round(this.writeIopsCounter / elapsedSec);
    const readIops = Math.round(this.readIopsCounter / elapsedSec);

    // Reset counters periodically
    if (elapsedSec >= 60) {
      this.writeIopsCounter = 0;
      this.readIopsCounter = 0;
      this.lastIopsReset = Date.now();
    }

    const failureRate = this.calculateFailureRate();
    if (failureRate > 0.05) {
      errors.push(`High segment failure rate: ${(failureRate * 100).toFixed(2)}%`);
    }

    // Determine Health State
    let healthState: EnterpriseStorageHealthState = "HEALTHY";

    if (this.forceReadOnly || usagePercent >= 99) {
      healthState = "READ_ONLY";
      warnings.push("Storage is in READ_ONLY mode");
    } else if (isFull) {
      healthState = "FULL";
      warnings.push("Storage has reached capacity limit");
    } else if (this.mockRaid?.status === "rebuilding") {
      healthState = "REBUILDING";
      warnings.push(`RAID array is rebuilding (${this.mockRaid.rebuildProgressPercent ?? 0}%)`);
    } else if (
      this.mockRaid?.status === "degraded" ||
      this.mockSmart?.overallStatus === "failed" ||
      (this.mockSmart?.reallocatedSectors && this.mockSmart.reallocatedSectors > 50) ||
      avgWriteLatency > 300 ||
      failureRate > 0.01
    ) {
      healthState = "DEGRADED";
      warnings.push("Storage is running in DEGRADED state");
    }

    const fsTelemetry: FilesystemTelemetry = {
      filesystemType: this.mockFilesystemType,
      mountPath: this.basePath,
      isReadOnly: this.forceReadOnly,
      inodeUsagePercent: Math.min(100, Math.round(usagePercent * 0.9)),
    };

    return {
      nodeId: this.nodeId,
      storageType: this.storageType,
      storageTier: this.storageTier,
      healthState,
      capacityBytes: capacity,
      usedBytes: used,
      availableBytes: available,
      usagePercent,
      writeLatencyMs: Math.round(avgWriteLatency * 100) / 100,
      readLatencyMs: Math.round(avgReadLatency * 100) / 100,
      p95WriteLatencyMs: Math.round(p95Write * 100) / 100,
      p95ReadLatencyMs: Math.round(p95Read * 100) / 100,
      readIops,
      writeIops,
      totalIops: readIops + writeIops,
      totalWritesAttempted: this.totalWrites,
      failedWritesCount: this.failedWrites,
      corruptedSegmentsCount: this.corruptedSegments,
      segmentFailureRate: failureRate,
      smart: this.mockSmart,
      raid: this.mockRaid,
      filesystem: fsTelemetry,
      lastCheckedAt: now,
      warnings,
      errors,
    };
  }

  private calculateFailureRate(): number {
    if (this.totalWrites === 0) return 0;
    return Math.round((this.failedWrites / this.totalWrites) * 10000) / 10000;
  }

  private calculateP95(latencies: number[]): number {
    if (latencies.length === 0) return 0;
    const sorted = [...latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return (sorted[Math.min(index, sorted.length - 1)] ?? 0) ?? 0;
  }
}
