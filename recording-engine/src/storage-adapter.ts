import { mkdir, statfs, unlink } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export type StorageStatus = "healthy" | "warning" | "critical" | "offline";
export type StorageType = "local-disk" | "nfs" | "smb" | "s3" | "cloud-archive" | "san";
export type RecordingStorageTier = "hot" | "warm" | "cold";

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
}

export interface StorageDestinationAdapter {
  getMetrics(): Promise<StorageMetrics>;
  getStagingPath(cameraId: string): Promise<string>;
  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string;
  deleteSegmentFile(storagePath: string): Promise<void>;
}

export interface StorageAdapterOptions {
  recordingRoot: string;
  supportedTiers: RecordingStorageTier[];
  storageType: StorageType;
  supportedProtocols: string[];
  location?: string;
}

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
}

export class NfsStorageAdapter implements StorageDestinationAdapter {
  constructor(private readonly options: StorageAdapterOptions) {}
  async getMetrics(): Promise<StorageMetrics> {
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
