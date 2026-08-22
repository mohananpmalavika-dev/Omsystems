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

export interface S3StorageOptions {
  nodeId: string;
  bucket: string;
  endpoint?: string;
  region?: string;
  prefix?: string;
  storageTier?: StorageTier;
  simulatedCapacityBytes?: number;
  simulatedUsedBytes?: number;
  forceOffline?: boolean;
}

export class S3StorageProvider implements RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType = "s3";
  readonly storageTier: StorageTier;
  readonly mountOrBucketUri: string;
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly prefix: string;

  // In-memory backing for local demonstration and unit testing without AWS SDK dependency overhead
  private readonly objectStore = new Map<string, { data: Buffer; metadata?: Record<string, unknown>; sha256: string }>();

  private totalWrites = 0;
  private failedWrites = 0;
  private corruptedSegments = 0;
  private writeLatencies: number[] = [];
  private readLatencies: number[] = [];
  private readIopsCounter = 0;
  private writeIopsCounter = 0;
  private lastIopsReset = Date.now();

  private forceOffline: boolean;
  private simulatedCapacityBytes: number;
  private simulatedUsedBytes: number;

  constructor(options: S3StorageOptions) {
    this.nodeId = options.nodeId;
    this.bucket = options.bucket;
    this.endpoint = options.endpoint || "https://s3.ap-south-1.amazonaws.com";
    this.region = options.region || "ap-south-1";
    this.prefix = options.prefix || "";
    this.mountOrBucketUri = `s3://${this.bucket}/${this.prefix ? `${this.prefix}/` : ""}`;
    this.storageTier = options.storageTier || "warm";
    this.forceOffline = options.forceOffline || false;
    this.simulatedCapacityBytes = options.simulatedCapacityBytes ?? 500_000_000_000_000; // 500TB
    this.simulatedUsedBytes = options.simulatedUsedBytes ?? 50_000_000_000_000;
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
      throw new Error(`S3 Object Storage [${this.nodeId}] is OFFLINE (endpoint ${this.endpoint} unreachable)`);
    }

    const start = performance.now();
    this.totalWrites++;
    this.writeIopsCounter++;

    const fullKey = this.prefix ? `${this.prefix}/${key}` : key;

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
      this.objectStore.set(fullKey, { data: buffer, metadata, sha256 });
      this.simulatedUsedBytes += buffer.length;

      const latency = performance.now() - start;
      this.writeLatencies.push(latency);
      if (this.writeLatencies.length > 500) this.writeLatencies.shift();

      return {
        key,
        uri: `s3://${this.bucket}/${fullKey}`,
        bytesWritten: buffer.length,
        sha256,
        writeLatencyMs: Math.round(latency * 100) / 100,
        checksum: sha256,
        metadata: {
          ...metadata,
          s3Bucket: this.bucket,
          s3Endpoint: this.endpoint,
          s3Region: this.region,
        },
      };
    } catch (err) {
      this.failedWrites++;
      throw err;
    }
  }

  async readSegment(
    key: string,
    range?: StorageReadOptions,
  ): Promise<Readable | Buffer> {
    if (this.forceOffline) {
      throw new Error(`S3 Object Storage [${this.nodeId}] is OFFLINE`);
    }

    const start = performance.now();
    this.readIopsCounter++;

    const fullKey = this.prefix ? `${this.prefix}/${key}` : key;
    const entry = this.objectStore.get(fullKey);

    if (!entry) {
      throw new Error(`NoSuchKey: Segment [${key}] does not exist in bucket [${this.bucket}]`);
    }

    const latency = performance.now() - start;
    this.readLatencies.push(latency);

    if (range && (range.start !== undefined || range.end !== undefined)) {
      const startOffset = range.start ?? 0;
      const endOffset = range.end !== undefined ? range.end + 1 : entry.data.length;
      const sliced = entry.data.subarray(startOffset, endOffset);
      return Readable.from(sliced);
    }

    return entry.data;
  }

  async deleteSegment(key: string): Promise<void> {
    if (this.forceOffline) throw new Error(`S3 [${this.nodeId}] is OFFLINE`);
    const fullKey = this.prefix ? `${this.prefix}/${key}` : key;
    const existing = this.objectStore.get(fullKey);
    if (existing) {
      this.simulatedUsedBytes = Math.max(0, this.simulatedUsedBytes - existing.data.length);
      this.objectStore.delete(fullKey);
    }
  }

  async exists(key: string): Promise<boolean> {
    if (this.forceOffline) return false;
    const fullKey = this.prefix ? `${this.prefix}/${key}` : key;
    return this.objectStore.has(fullKey);
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
        warnings: [`S3 bucket ${this.bucket} unreachable`],
        errors: [`HTTP 503 / DNS resolution failure to ${this.endpoint}`],
      };
    }

    const available = Math.max(0, this.simulatedCapacityBytes - this.simulatedUsedBytes);
    const usagePercent = Math.round((this.simulatedUsedBytes / this.simulatedCapacityBytes) * 10000) / 100;

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
    if (failureRate > 0.05 || avgWrite > 500) {
      healthState = "DEGRADED";
      warnings.push("High S3 HTTP PUT latency or error rate");
    }

    return {
      nodeId: this.nodeId,
      storageType: this.storageType,
      storageTier: this.storageTier,
      healthState,
      capacityBytes: this.simulatedCapacityBytes,
      usedBytes: this.simulatedUsedBytes,
      availableBytes: available,
      usagePercent,
      writeLatencyMs: Math.round(avgWrite * 100) / 100,
      readLatencyMs: Math.round(avgRead * 100) / 100,
      p95WriteLatencyMs: Math.round(avgWrite * 1.25 * 100) / 100,
      p95ReadLatencyMs: Math.round(avgRead * 1.25 * 100) / 100,
      readIops,
      writeIops,
      totalIops: readIops + writeIops,
      totalWritesAttempted: this.totalWrites,
      failedWritesCount: this.failedWrites,
      corruptedSegmentsCount: this.corruptedSegments,
      segmentFailureRate: failureRate,
      filesystem: {
        filesystemType: "S3 Object Store",
        mountPath: `s3://${this.bucket}`,
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
