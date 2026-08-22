import type { Readable } from "node:stream";
import type { EnterpriseStorageHealthState, EnterpriseStorageType } from "../domain/models.js";

export type StorageTier = "hot" | "warm" | "cold" | "archive";

export interface StorageWriteResult {
  key: string;
  uri: string;
  bytesWritten: number;
  sha256?: string;
  writeLatencyMs: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageReadOptions {
  start?: number;
  end?: number;
}

export interface SmartTelemetry {
  overallStatus: "passed" | "failed" | "unknown";
  reallocatedSectors: number;
  pendingSectors: number;
  uncorrectableSectors: number;
  temperatureCelsius?: number;
  powerOnHours?: number;
  readErrors: number;
  writeErrors: number;
  remainingSsdLifePercent?: number;
  interfaceCrcErrors: number;
}

export interface RaidTelemetry {
  status: "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
  level?: string;
  memberDisks: string[];
  failedMembers: string[];
  rebuildProgressPercent?: number;
  hotSpareStatus?: "active" | "inactive" | "unknown";
  controllerHealth?: "healthy" | "warning" | "critical" | "unknown";
}

export interface FilesystemTelemetry {
  filesystemType: string;
  mountPath: string;
  mountOptions?: string;
  isReadOnly: boolean;
  totalInodes?: number;
  usedInodes?: number;
  inodeUsagePercent?: number;
}

export interface StorageHealthStatus {
  nodeId: string;
  storageType: EnterpriseStorageType;
  storageTier: StorageTier;
  healthState: EnterpriseStorageHealthState;
  
  // Capacity & Utilization
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  usagePercent: number;

  // Latencies & IOPS
  writeLatencyMs: number;
  readLatencyMs: number;
  p95WriteLatencyMs: number;
  p95ReadLatencyMs: number;
  readIops: number;
  writeIops: number;
  totalIops: number;

  // Segment write reliability
  totalWritesAttempted: number;
  failedWritesCount: number;
  corruptedSegmentsCount: number;
  segmentFailureRate: number; // 0.0000 to 1.0000

  // Hardware Diagnostics
  smart?: SmartTelemetry;
  raid?: RaidTelemetry;
  filesystem?: FilesystemTelemetry;

  lastCheckedAt: Date;
  warnings: string[];
  errors: string[];
}

export interface RecordingStorage {
  readonly nodeId: string;
  readonly storageType: EnterpriseStorageType;
  readonly storageTier: StorageTier;
  readonly mountOrBucketUri: string;

  /**
   * Writes a segment to the storage medium with integrity validation
   */
  writeSegment(
    key: string,
    data: Buffer | Readable,
    metadata?: Record<string, unknown>,
  ): Promise<StorageWriteResult>;

  /**
   * Reads a segment or byte-range stream from storage
   */
  readSegment(
    key: string,
    range?: StorageReadOptions,
  ): Promise<Readable | Buffer>;

  /**
   * Deletes a segment from storage
   */
  deleteSegment(key: string): Promise<void>;

  /**
   * Checks if a segment exists on storage
   */
  exists(key: string): Promise<boolean>;

  /**
   * Evaluates comprehensive storage node health, diagnostics, and performance telemetry
   */
  health(): Promise<StorageHealthStatus>;
}
