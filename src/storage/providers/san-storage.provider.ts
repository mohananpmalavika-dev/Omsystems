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

export interface SanStorageOptions {
  nodeId: string;
  volumeMountPath: string; // e.g. /mnt/san/lun01
  sanProtocol?: "iscsi" | "fc";
  iqnOrWwn?: string;
  storageTier?: StorageTier;
  simulatedCapacityBytes?: number;
  simulatedUsedBytes?: number;
  multipathActivePaths?: number;
  multipathTotalPaths?: number;
  forcePathFailure?: boolean;
  forceOffline?: boolean;
}

export class SanStorageProvider implements RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType = "san";
  readonly storageTier: StorageTier;
  readonly mountOrBucketUri: string;
  readonly sanProtocol: "iscsi" | "fc";
  readonly iqnOrWwn: string;
  private readonly volumeMountPath: string;

  private totalWrites = 0;
  private failedWrites = 0;
  private corruptedSegments = 0;
  private writeLatencies: number[] = [];
  private readLatencies: number[] = [];
  private readIopsCounter = 0;
  private writeIopsCounter = 0;
  private lastIopsReset = Date.now();

  private multipathActivePaths: number;
  private multipathTotalPaths: number;
  private forcePathFailure: boolean;
  private forceOffline: boolean;
  private simulatedCapacityBytes?: number;
  private simulatedUsedBytes?: number;

  constructor(options: SanStorageOptions) {
    this.nodeId = options.nodeId;
    this.volumeMountPath = resolve(options.volumeMountPath);
    this.sanProtocol = options.sanProtocol || "iscsi";
    this.iqnOrWwn = options.iqnOrWwn || "iqn.1998-01.com.vmware:san-target-01";
    this.mountOrBucketUri = `san://${this.sanProtocol}/${this.iqnOrWwn}/${this.volumeMountPath.replace(/^[/\\]+/, "").replace(/\\/g, "/")}`;
    this.storageTier = options.storageTier || "hot";
    this.multipathActivePaths = options.multipathActivePaths ?? 4;
    this.multipathTotalPaths = options.multipathTotalPaths ?? 4;
    this.forcePathFailure = options.forcePathFailure || false;
    this.forceOffline = options.forceOffline || false;
    this.simulatedCapacityBytes = options.simulatedCapacityBytes;
    this.simulatedUsedBytes = options.simulatedUsedBytes;
  }

  setForceOffline(offline: boolean): void {
    this.forceOffline = offline;
  }

  setMultipathState(active: number, total: number): void {
    this.multipathActivePaths = active;
    this.multipathTotalPaths = total;
  }

  async writeSegment(
    key: string,
    data: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult> {
    if (this.forceOffline) {
      this.failedWrites++;
      throw new Error(`SAN Storage [${this.nodeId}] is OFFLINE`);
    }

    const start = performance.now();
    this.totalWrites++;
    this.writeIopsCounter++;

    const targetPath = join(this.volumeMountPath, key);
    const tempPath = `${targetPath}.san_tmp.${Date.now()}`;
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
          sanProtocol: this.sanProtocol,
          iqnOrWwn: this.iqnOrWwn,
          multipath: `${this.multipathActivePaths}/${this.multipathTotalPaths}`,
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
      throw new Error(`SAN Storage [${this.nodeId}] is OFFLINE`);
    }

    const start = performance.now();
    this.readIopsCounter++;
    const targetPath = join(this.volumeMountPath, key);

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
      throw new Error(`Failed to read segment [${key}] on SAN [${this.nodeId}]: ${String(err)}`);
    }
  }

  async deleteSegment(key: string): Promise<void> {
    if (this.forceOffline) throw new Error(`SAN [${this.nodeId}] is OFFLINE`);
    const targetPath = join(this.volumeMountPath, key);
    try {
      await unlink(targetPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.forceOffline) return false;
    const targetPath = join(this.volumeMountPath, key);
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
        warnings: ["SAN LUN disconnected"],
        errors: ["iSCSI session dropped / FC fabric unreachable"],
      };
    }

    let capacity = this.simulatedCapacityBytes ?? 50_000_000_000_000; // default 50TB
    let used = this.simulatedUsedBytes ?? 12_000_000_000_000;
    let available = Math.max(0, capacity - used);

    try {
      const stats = await statfs(this.volumeMountPath);
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
    if (this.forcePathFailure || this.multipathActivePaths < this.multipathTotalPaths) {
      healthState = "DEGRADED";
      warnings.push(`SAN multipath degraded (${this.multipathActivePaths}/${this.multipathTotalPaths} active paths)`);
    } else if (isFull) {
      healthState = "FULL";
      warnings.push("SAN volume full");
    }

    const fsTelemetry: FilesystemTelemetry = {
      filesystemType: "XFS (SAN-Direct)",
      mountPath: this.volumeMountPath,
      mountOptions: "rw,noatime,nodiratime,logbufs=8,logbsize=256k",
      isReadOnly: false,
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
      writeLatencyMs: Math.round(avgWrite * 100) / 100,
      readLatencyMs: Math.round(avgRead * 100) / 100,
      p95WriteLatencyMs: Math.round(avgWrite * 1.2 * 100) / 100,
      p95ReadLatencyMs: Math.round(avgRead * 1.2 * 100) / 100,
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
