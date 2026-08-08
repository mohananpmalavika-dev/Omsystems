import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { storageHealthAgent, type StorageHealthReport } from "./storage-health-agent.js";

export type StorageStatus = "healthy" | "warning" | "critical" | "offline";
export type StorageType = "local-disk" | "nfs" | "smb" | "s3" | "cloud-archive" | "san";
export type RecordingStorageTier = "hot" | "warm" | "cold";

export type RaidStatus = "healthy" | "degraded" | "rebuilding" | "failed" | "unknown";
export interface SmartStats {
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

export interface RaidStats {
  status: RaidStatus;
  level?: string;
  memberDisks: string[];
  failedMembers: string[];
  rebuildProgressPercent?: number;
  hotSpareStatus?: "active" | "inactive" | "unknown";
  controllerHealth?: "healthy" | "warning" | "critical" | "unknown";
}

export interface StorageProbeResult {
  status: "passed" | "failed";
  latencyMs: number;
  bytesWritten: number;
  checksum: string;
  error?: string;
}

export interface StorageMetrics {
  capacityBytes: number;
  usedBytes: number;
  availableBytes: number;
  status: StorageStatus;
  supportedTiers: RecordingStorageTier[];
  storageType: StorageType;
  location?: string;
  supportedProtocols: string[];
  writeMbps?: number;
  readMbps?: number;
  latencyMs?: number;
  temperatureCelsius?: number;
  mountPath: string;
  smart?: SmartStats;
  raid?: RaidStats;
  lastWriteProbe?: StorageProbeResult;
  healthReport?: StorageHealthReport; // Comprehensive storage health from Storage Health Agent
}

export interface StorageDestinationAdapter {
  getMetrics(): Promise<StorageMetrics>;
  getStagingPath(cameraId: string): Promise<string>;
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string;
  deleteSegmentFile(storagePath: string): Promise<void>;
  runWriteProbe(): Promise<StorageProbeResult>;
}

export interface StorageAdapterOptions {
  recordingRoot: string;
  supportedTiers: RecordingStorageTier[];
  storageType: StorageType;
  supportedProtocols: string[];
  location?: string;
}

const execFileAsync = promisify(execFile);

export class LocalDiskStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}

  async getMetrics(): Promise<StorageMetrics> {
    const fsStats = await statfs(this.options.recordingRoot);
    const capacityBytes = fsStats.blocks * fsStats.bsize;
    const availableBytes = fsStats.bavail * fsStats.bsize;
    const usedBytes = Math.max(0, capacityBytes - availableBytes);
    const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
    const status: StorageStatus = usedPercent >= 95
      ? "critical"
      : usedPercent >= 80
        ? "warning"
        : "healthy";

    // Get comprehensive storage health report from Storage Health Agent
    const healthReport = await storageHealthAgent.getHealthReport();

    // Find the disk that matches our mount path
    const mountPath = resolve(this.options.recordingRoot);
    const physicalDisk = healthReport.physicalDisks.find((d) => d.mountPoint === mountPath);

    // Use data from health report for SMART and RAID
    const smart = physicalDisk?.smart ? {
      overallStatus: physicalDisk.smart.overallStatus,
      reallocatedSectors: physicalDisk.smart.reallocatedSectors,
      pendingSectors: physicalDisk.smart.pendingSectors,
      uncorrectableSectors: physicalDisk.smart.uncorrectableSectors,
      temperatureCelsius: physicalDisk.smart.temperatureCelsius,
      powerOnHours: physicalDisk.smart.powerOnHours,
      readErrors: physicalDisk.smart.readErrors,
      writeErrors: physicalDisk.smart.writeErrors,
      remainingSsdLifePercent: physicalDisk.smart.remainingSsdLifePercent,
      interfaceCrcErrors: physicalDisk.smart.interfaceCrcErrors,
    } : undefined;

    // Find RAID array that includes our disk
    const raidArray = healthReport.raidArrays.find((r) => 
      physicalDisk && r.memberDisks.includes(physicalDisk.devicePath)
    );

    const raid = raidArray ? {
      status: raidArray.status,
      level: raidArray.level,
      memberDisks: raidArray.memberDisks,
      failedMembers: raidArray.failedMembers,
      rebuildProgressPercent: raidArray.rebuildProgressPercent,
      hotSpareStatus: raidArray.spareMemberCount && raidArray.spareMemberCount > 0 ? "active" : "inactive",
      controllerHealth: raidArray.controllerHealth,
    } : undefined;

    return {
      capacityBytes,
      availableBytes,
      usedBytes,
      status,
      supportedTiers: this.options.supportedTiers,
      storageType: this.options.storageType,
      location: this.options.location,
      supportedProtocols: this.options.supportedProtocols,
      mountPath,
      smart,
      raid,
      healthReport, // Include full health report for comprehensive monitoring
    };
  }

  async getStagingPath(cameraId: string): Promise<string> {
    const stagingPath = join(resolve(this.options.recordingRoot), safe(cameraId), ".staging");
    await mkdir(stagingPath, { recursive: true });
    return stagingPath;
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    return join(
      resolve(this.options.recordingRoot),
      safe(cameraId),
      String(startedAt.getUTCFullYear()),
      two(startedAt.getUTCMonth() + 1),
      two(startedAt.getUTCDate()),
      two(startedAt.getUTCHours()),
      fileName,
    );
  }

  async deleteSegmentFile(storagePath: string): Promise<void> {
    const targetPath = resolve(this.options.recordingRoot, storagePath);
    assertInsideRoot(targetPath, this.options.recordingRoot);
    await unlink(targetPath);
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeDir = join(resolve(this.options.recordingRoot), ".write-probe");
    const probePath = join(probeDir, `probe-${Date.now()}.bin`);
    const payload = Buffer.from(`sentinel-write-probe:${Date.now()}:${Math.random().toString(36)}`);
    try {
      await mkdir(probeDir, { recursive: true });
      await writeFile(probePath, payload);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const contents = await readFile(probePath);
      if (!contents.equals(payload)) throw new Error("probe_payload_mismatch");
      const checksum = createHash("sha256").update(contents).digest("hex");
      await unlink(probePath);
      return {
        status: "passed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum,
      };
    } catch (error) {
      await unlink(probePath).catch(() => undefined);
      return {
        status: "failed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
}

export class NfsStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  
  async getMetrics(): Promise<StorageMetrics> {
    const fsStats = await statfs(this.options.recordingRoot);
    const capacityBytes = fsStats.blocks * fsStats.bsize;
    const availableBytes = fsStats.bavail * fsStats.bsize;
    const usedBytes = Math.max(0, capacityBytes - availableBytes);
    const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
    const status: StorageStatus = usedPercent >= 95
      ? "critical"
      : usedPercent >= 80
        ? "warning"
        : "healthy";

    // NFS-specific: Get comprehensive storage health report from Storage Health Agent
    const healthReport = await storageHealthAgent.getHealthReport();

    // For NFS, SMART data is not directly available (remote storage)
    // But we can still report basic metrics
    const mountPath = resolve(this.options.recordingRoot);

    return {
      capacityBytes,
      availableBytes,
      usedBytes,
      status,
      supportedTiers: this.options.supportedTiers,
      storageType: this.options.storageType,
      location: this.options.location,
      supportedProtocols: this.options.supportedProtocols,
      mountPath,
      healthReport,
    };
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeDir = join(resolve(this.options.recordingRoot), ".write-probe");
    const probePath = join(probeDir, `probe-${Date.now()}.bin`);
    const payload = Buffer.from(`sentinel-write-probe:${Date.now()}:${Math.random().toString(36)}`);
    try {
      await mkdir(probeDir, { recursive: true });
      await writeFile(probePath, payload);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const contents = await readFile(probePath);
      if (!contents.equals(payload)) throw new Error("probe_payload_mismatch");
      const checksum = createHash("sha256").update(contents).digest("hex");
      await unlink(probePath);
      return {
        status: "passed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum,
      };
    } catch (error) {
      await unlink(probePath).catch(() => undefined);
      return {
        status: "failed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getStagingPath(cameraId: string): Promise<string> {
    const stagingPath = join(resolve(this.options.recordingRoot), safe(cameraId), ".staging");
    await mkdir(stagingPath, { recursive: true });
    return stagingPath;
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    return join(
      resolve(this.options.recordingRoot),
      safe(cameraId),
      String(startedAt.getUTCFullYear()),
      two(startedAt.getUTCMonth() + 1),
      two(startedAt.getUTCDate()),
      two(startedAt.getUTCHours()),
      fileName,
    );
  }

  async deleteSegmentFile(storagePath: string): Promise<void> {
    const targetPath = resolve(this.options.recordingRoot, storagePath);
    assertInsideRoot(targetPath, this.options.recordingRoot);
    await unlink(targetPath);
  }
}

export class SmbStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("SMB storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("SMB storage adapter is not implemented yet");
  }
}

export class S3StorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("S3-compatible storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("S3-compatible storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("S3-compatible storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("S3-compatible storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("S3-compatible storage adapter is not implemented yet");
  }
}

export class CloudArchiveStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("Cloud archive storage adapter is not implemented yet");
  }
}

export class SanStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("SAN storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("SAN storage adapter is not implemented yet");
  }
}

export function createStorageAdapter(options: StorageAdapterOptions): StorageDestinationAdapter {
  switch (options.storageType) {
    case "local-disk":
      return new LocalDiskStorageAdapter(options);
    case "nfs":
      return new NfsStorageAdapter(options);
    case "smb":
      return new SmbStorageAdapter(options);
    case "s3":
      return new S3StorageAdapter(options);
    case "cloud-archive":
      return new CloudArchiveStorageAdapter(options);
    case "san":
      return new SanStorageAdapter(options);
    default:
      throw new Error(`unsupported_storage_type:${options.storageType}`);
  }
}

function safe(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
}

function two(value: number) {
  return String(value).padStart(2, "0");
}

function assertInsideRoot(path: string, root: string) {
  const resolvedRoot = resolve(root);
  const resolvedPath = resolve(path);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new Error("invalid_storage_path");
  }
}
