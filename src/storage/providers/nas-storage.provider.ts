import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { EnterpriseStorageHealthState, EnterpriseStorageType } from "../../domain/models.js";
import type {
  FilesystemTelemetry,
  RecordingStorage,
  StorageHealthStatus,
  StorageReadOptions,
  StorageTier,
  StorageWriteResult,
} from "../recording-storage.interface.js";

export interface NasStorageOptions {
  nodeId: string;
  sharePath: string; // e.g. /mnt/nfs/branch01 or \\nas01\cctv
  protocol?: "nfs" | "smb";
  storageTier?: StorageTier;
  simulatedCapacityBytes?: number;
  simulatedUsedBytes?: number;
  serverHost?: string;
  forceStaleHandle?: boolean;
  forceOffline?: boolean;
}

export class NasStorageProvider implements RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType = "nas";
  readonly storageTier: StorageTier;
  readonly mountOrBucketUri: string;
  readonly protocol: "nfs" | "smb";
  readonly serverHost: string;
  private readonly sharePath: string;

  private totalWrites = 0;
  private failedWrites = 0;
  private corruptedSegments = 0;
  private writeLatencies: number[] = [];
  private readLatencies: number[] = [];
  private readIopsCounter = 0;
  private writeIopsCounter = 0;
  private lastIopsReset = Date.now();

  private forceStaleHandle: boolean;
  private forceOffline: boolean;
  private simulatedCapacityBytes?: number;
  private simulatedUsedBytes?: number;

  constructor(options: NasStorageOptions) {
    this.nodeId = options.nodeId;
    this.sharePath = resolve(options.sharePath);
    this.protocol = options.protocol || "nfs";
    this.serverHost = options.serverHost || "nas.local";
    this.mountOrBucketUri = `${this.protocol}://${this.serverHost}/${this.sharePath.replace(/^[/\\]+/, "").replace(/\\/g, "/")}`;
    this.storageTier = options.storageTier || "warm";
    this.forceStaleHandle = options.forceStaleHandle || false;
    this.forceOffline = options.forceOffline || false;
    this.simulatedCapacityBytes = options.simulatedCapacityBytes;
    this.simulatedUsedBytes = options.simulatedUsedBytes;
  }

  setForceOffline(offline: boolean): void {
    this.forceOffline = offline;
  }

  setForceStaleHandle(stale: boolean): void {
    this.forceStaleHandle = stale;
  }

  async writeSegment(
    key: string,
    data: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult> {
    if (this.forceOffline) {
      this.failedWrites++;
      throw new Error(`NAS Storage node [${this.nodeId}] is OFFLINE (server ${this.serverHost} unreachable)`);
    }
    if (this.forceStaleHandle) {
      this.failedWrites++;
      throw new Error(`NAS Storage node [${this.nodeId}] error: ESTALE Stale file handle`);
    }

    const start = performance.now();
    this.totalWrites++;
    this.writeIopsCounter++;

    const targetPath = join(this.sharePath, key);
    const tempPath = `${targetPath}.nas_tmp.${Date.now()}`;
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
        metadata: {
          ...metadata,
          nasProtocol: this.protocol,
          nasHost: this.serverHost,
        },
      };
    } catch (err) {
      this.failedWrites++;
      try {
        await unlink(tempPath);
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async readSegment(
    key: string,
    range?: StorageReadOptions,
  ): Promise<Readable | Buffer> {
    if (this.forceOffline) {
      throw new Error(`NAS Storage node [${this.nodeId}] is OFFLINE`);
    }
    if (this.forceStaleHandle) {
      throw new Error(`NAS Storage node [${this.nodeId}] error: ESTALE Stale file handle`);
    }

    const start = performance.now();
    this.readIopsCounter++;
    const targetPath = join(this.sharePath, key);

    try {
      if (range && (range.start !== undefined || range.end !== undefined)) {
        const stream = createReadStream(targetPath, {
          start: range.start,
          end: range.end,
        });
        const latency = performance.now() - start;
        this.readLatencies.push(latency);
        return stream;
      }

      const buffer = await readFile(targetPath);
      const latency = performance.now() - start;
      this.readLatencies.push(latency);
      return buffer;
    } catch (err) {
      throw new Error(`Failed to read segment [${key}] on NAS [${this.nodeId}]: ${String(err)}`);
    }
  }

  async deleteSegment(key: string): Promise<void> {
    if (this.forceOffline) throw new Error(`NAS [${this.nodeId}] is OFFLINE`);
    const targetPath = join(this.sharePath, key);
    try {
      await unlink(targetPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.forceOffline) return false;
    const targetPath = join(this.sharePath, key);
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
        warnings: [`NAS share ${this.mountOrBucketUri} unreachable`],
        errors: ["NFS mount disconnected / server not responding"],
      };
    }

    let capacity = this.simulatedCapacityBytes ?? 10_000_000_000_000; // default 10TB
    let used = this.simulatedUsedBytes ?? 3_500_000_000_000;
    let available = Math.max(0, capacity - used);

    try {
      const stats = await statfs(this.sharePath);
      if (stats.bsize && stats.blocks && !this.simulatedCapacityBytes) {
        capacity = stats.bsize * stats.blocks;
        available = stats.bsize * stats.bavail;
        used = capacity - available;
      }
    } catch {
      // fallback
    }

    const usagePercent = capacity > 0 ? Math.round((used / capacity) * 10000) / 100 : 0;
    const isFull = usagePercent >= 95;

    const avgWrite = this.writeLatencies.length > 0
      ? this.writeLatencies.reduce((a, b) => a + b, 0) / this.writeLatencies.length
      : 0;
    const avgRead = this.readLatencies.length > 0
      ? this.readLatencies.reduce((a, b) => a + b, 0) / this.readLatencies.length
      : 0;

    const elapsedSec = Math.max(1, (Date.now() - this.lastIopsReset) / 1000);
    const writeIops = Math.round(this.writeIopsCounter / elapsedSec);
    const readIops = Math.round(this.readIopsCounter / elapsedSec);

    const failureRate = this.calculateFailureRate();

    let healthState: EnterpriseStorageHealthState = "HEALTHY";
    if (this.forceStaleHandle || failureRate > 0.05 || avgWrite > 400) {
      healthState = "DEGRADED";
      warnings.push("High network share write latency or stale handle detected");
    } else if (isFull) {
      healthState = "FULL";
      warnings.push("NAS storage capacity limit reached");
    }

    const fsTelemetry: FilesystemTelemetry = {
      filesystemType: this.protocol.toUpperCase(),
      mountPath: this.sharePath,
      mountOptions: `proto=${this.protocol},rsize=1048576,wsize=1048576,hard,timeo=600`,
      isReadOnly: false,
      inodeUsagePercent: Math.min(100, Math.round(usagePercent * 0.95)),
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
      writeLatencyMs: Math.round(avgWrite * 100) / 100,
      readLatencyMs: Math.round(avgRead * 100) / 100,
      p95WriteLatencyMs: Math.round(avgWrite * 1.3 * 100) / 100,
      p95ReadLatencyMs: Math.round(avgRead * 1.3 * 100) / 100,
      readIops,
      writeIops,
      totalIops: readIops + writeIops,
      totalWritesAttempted: this.totalWrites,
      failedWritesCount: this.failedWrites,
      corruptedSegmentsCount: this.corruptedSegments,
      segmentFailureRate: failureRate,
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
}
