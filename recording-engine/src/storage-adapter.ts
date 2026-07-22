import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

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
    const disk = await statfs(this.options.recordingRoot);
    const capacityBytes = disk.blocks * disk.bsize;
    const availableBytes = disk.bavail * disk.bsize;
    const usedBytes = Math.max(0, capacityBytes - availableBytes);
    const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
    const status: StorageStatus = usedPercent >= 95
      ? "critical"
      : usedPercent >= 80
        ? "warning"
        : "healthy";

    const smart = await this.getSmartStats();
    const raid = await this.getRaidStats();

    return {
      capacityBytes,
      availableBytes,
      usedBytes,
      status,
      supportedTiers: this.options.supportedTiers,
      storageType: this.options.storageType,
      location: this.options.location,
      supportedProtocols: this.options.supportedProtocols,
      mountPath: resolve(this.options.recordingRoot),
      smart,
      raid,
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

  private async getSmartStats(): Promise<SmartStats> {
    try {
      const { stdout } = await execFileAsync("smartctl", ["-n", "standby", "-A", "/dev/sda"], { timeout: 5_000 });
      const lines = stdout.split(/\r?\n/);
      const tempLine = lines.find((line) => /Temperature_Celsius|Temperature/i.test(line));
      const tempValue = tempLine ? Number(tempLine.match(/(\d+)/)?.[1]) : undefined;
      const powerLine = lines.find((line) => /Power_On_Hours/i.test(line));
      const powerOnHours = powerLine ? Number(powerLine.match(/(\d+)/)?.[1]) : undefined;
      const reallocatedLine = lines.find((line) => /Reallocated_Sector_Ct/i.test(line));
      const pendingLine = lines.find((line) => /Current_Pending_Sector/i.test(line));
      const uncorrectableLine = lines.find((line) => /Offline_Uncorrectable/i.test(line));
      const readErrorsLine = lines.find((line) => /Raw_Read_Error_Rate/i.test(line));
      const writeErrorsLine = lines.find((line) => /Write_Error_Rate/i.test(line));
      const lifeLine = lines.find((line) => /remaining_life|wear_leveling/i.test(line));
      const lifeValue = lifeLine ? Number(lifeLine.match(/(\d+)/)?.[1]) : undefined;
      const crcLine = lines.find((line) => /CRC/i.test(line));
      return {
        overallStatus: /FAIL|BAD|UNKNOWN/i.test(stdout) ? "failed" : "passed",
        reallocatedSectors: reallocatedLine ? Number(reallocatedLine.match(/(\d+)/)?.[1] ?? 0) : 0,
        pendingSectors: pendingLine ? Number(pendingLine.match(/(\d+)/)?.[1] ?? 0) : 0,
        uncorrectableSectors: uncorrectableLine ? Number(uncorrectableLine.match(/(\d+)/)?.[1] ?? 0) : 0,
        temperatureCelsius: Number.isFinite(tempValue) ? tempValue : undefined,
        powerOnHours: Number.isFinite(powerOnHours) ? powerOnHours : undefined,
        readErrors: readErrorsLine ? Number(readErrorsLine.match(/(\d+)/)?.[1] ?? 0) : 0,
        writeErrors: writeErrorsLine ? Number(writeErrorsLine.match(/(\d+)/)?.[1] ?? 0) : 0,
        remainingSsdLifePercent: Number.isFinite(lifeValue) ? Math.min(100, lifeValue) : undefined,
        interfaceCrcErrors: crcLine ? Number(crcLine.match(/(\d+)/)?.[1] ?? 0) : 0,
      };
    } catch {
      return {
        overallStatus: "unknown",
        reallocatedSectors: 0,
        pendingSectors: 0,
        uncorrectableSectors: 0,
        temperatureCelsius: undefined,
        powerOnHours: undefined,
        readErrors: 0,
        writeErrors: 0,
        remainingSsdLifePercent: undefined,
        interfaceCrcErrors: 0,
      };
    }
  }

  private async getRaidStats(): Promise<RaidStats> {
    try {
      const { stdout } = await execFileAsync("mdadm", ["--detail", "--scan"], { timeout: 5_000 });
      const levelMatch = stdout.match(/raid([0-9]+)/i);
      const memberMatches = stdout.match(/\b([a-zA-Z0-9/_.-]+)\b/g) ?? [];
      const members = memberMatches.filter((item) => /sd|vd|nvme/.test(item)).slice(0, 4);
      return {
        status: "healthy",
        level: levelMatch ? `RAID${levelMatch[1]}` : undefined,
        memberDisks: members,
        failedMembers: [],
        rebuildProgressPercent: 0,
        hotSpareStatus: "inactive",
        controllerHealth: "healthy",
      };
    } catch {
      return {
        status: "unknown",
        level: undefined,
        memberDisks: [],
        failedMembers: [],
        rebuildProgressPercent: undefined,
        hotSpareStatus: "unknown",
        controllerHealth: "unknown",
      };
    }
  }
}

export class NfsStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
    throw new Error("NFS storage adapter is not implemented yet");
  }
  async runWriteProbe(): Promise<StorageProbeResult> {
    throw new Error("NFS storage adapter is not implemented yet");
  }
  async getStagingPath(cameraId: string): Promise<string> {
    throw new Error("NFS storage adapter is not implemented yet");
  }
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    throw new Error("NFS storage adapter is not implemented yet");
  }
  async deleteSegmentFile(storagePath: string): Promise<void> {
    throw new Error("NFS storage adapter is not implemented yet");
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
