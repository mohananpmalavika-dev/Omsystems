/**
 * Base Filesystem Storage Backend
 * 
 * Provides unified, crash-safe filesystem operations for Local Disk, NFS, SMB, and SAN.
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, statfs, unlink } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { StorageBackend } from "./storage-backend.interface.js";
import type {
  RecordingStorageTier,
  StorageBackendKind,
  StorageCapacity,
  StorageCapacityPolicy,
  StorageHealth,
  StorageLocator,
  StorageMetrics,
  StorageProbeResult,
  StorageStatus,
  StorageType,
  StorageVerificationResult,
  StorageWriteRequest,
  StorageWriteResult,
} from "../../../packages/contracts/src/storage/storage-types.js";
import { DEFAULT_STORAGE_CAPACITY_POLICY } from "../../../packages/contracts/src/storage/storage-types.js";
import {
  LegalHoldProtectedError,
  mapSystemErrorToStorageErrorCode,
  StorageChecksumMismatchError,
  StorageError,
  StorageErrorCode,
  StorageFullError,
} from "../../../packages/contracts/src/storage/storage-errors.js";
import { writeAtomic } from "../staging/atomic-write-helper.js";
import { SegmentChecksum } from "../segments/segment-checksum.js";

export interface FilesystemStorageBackendOptions {
  id: string;
  recordingRoot: string;
  storageType?: StorageType;
  supportedTiers?: RecordingStorageTier[];
  supportedProtocols?: string[];
  capacityPolicy?: Partial<StorageCapacityPolicy>;
}

export class FilesystemStorageBackend implements StorageBackend {
  readonly id: string;
  readonly type: StorageType;
  readonly backendKind: StorageBackendKind = "FILESYSTEM";
  protected readonly recordingRoot: string;
  protected supportedTiers: RecordingStorageTier[];
  protected supportedProtocols: string[];
  protected capacityPolicy: StorageCapacityPolicy;
  protected consecutiveFailures = 0;
  protected lastSuccessfulWrite?: Date;
  protected lastSuccessfulProbe?: Date;
  protected lastError?: string;

  constructor(options: FilesystemStorageBackendOptions) {
    this.id = options.id;
    this.recordingRoot = resolve(options.recordingRoot);
    this.type = options.storageType || "local-disk";
    this.supportedTiers = options.supportedTiers || ["hot", "warm"];
    this.supportedProtocols = options.supportedProtocols || ["posix", "file"];
    this.capacityPolicy = {
      ...DEFAULT_STORAGE_CAPACITY_POLICY,
      ...options.capacityPolicy,
    };
  }

  setCapacityPolicy(policy: Partial<StorageCapacityPolicy>): void {
    this.capacityPolicy = {
      ...this.capacityPolicy,
      ...policy,
    };
  }

  async getMetrics(): Promise<StorageMetrics> {
    try {
      await mkdir(this.recordingRoot, { recursive: true });
      const fsStats = await statfs(this.recordingRoot);
      const capacityBytes = Number(fsStats.blocks) * Number(fsStats.bsize);
      const availableBytes = Number(fsStats.bavail) * Number(fsStats.bsize);
      const usedBytes = Math.max(0, capacityBytes - availableBytes);
      const usedPercent = capacityBytes > 0 ? (usedBytes / capacityBytes) * 100 : 100;

      let status: StorageStatus = "healthy";
      if (usedPercent >= this.capacityPolicy.stopWritePercent || availableBytes <= this.capacityPolicy.minimumFreeBytes) {
        status = "critical";
      } else if (usedPercent >= this.capacityPolicy.warningPercent) {
        status = "warning";
      }

      const capacity: StorageCapacity = {
        type: "FIXED",
        totalBytes: capacityBytes,
        usedBytes,
        availableBytes,
        usedPercent,
      };

      return {
        storageNodeId: this.id,
        storageType: this.type,
        backendKind: this.backendKind,
        status,
        capacity,
        mountPathOrLocation: this.recordingRoot,
        supportedTiers: this.supportedTiers,
        supportedProtocols: this.supportedProtocols,
        metricsSource: "FILESYSTEM",
        metricsFreshness: "REALTIME",
        metricsObservedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);
      return {
        storageNodeId: this.id,
        storageType: this.type,
        backendKind: this.backendKind,
        status: "offline",
        capacity: {
          type: "FIXED",
          totalBytes: 0,
          usedBytes: 0,
          availableBytes: 0,
          usedPercent: 100,
        },
        mountPathOrLocation: this.recordingRoot,
        supportedTiers: this.supportedTiers,
        supportedProtocols: this.supportedProtocols,
        metricsSource: "FILESYSTEM",
        metricsFreshness: "REALTIME",
        metricsObservedAt: new Date().toISOString(),
      };
    }
  }

  async getHealth(): Promise<StorageHealth> {
    const metrics = await this.getMetrics();
    const isWritable = metrics.status !== "critical" && metrics.status !== "offline";
    const isReadable = metrics.status !== "offline";

    return {
      storageNodeId: this.id,
      storageType: this.type,
      status: metrics.status,
      isWritable,
      isReadable,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessfulWrite: this.lastSuccessfulWrite?.toISOString(),
      lastSuccessfulProbe: this.lastSuccessfulProbe?.toISOString(),
      lastError: this.lastError,
      checkedAt: new Date().toISOString(),
    };
  }

  async canAcceptWrite(params: { estimatedBytes?: number }): Promise<{ allowed: boolean; reason?: string }> {
    const metrics = await this.getMetrics();
    if (metrics.status === "offline") {
      return { allowed: false, reason: `Storage node '${this.id}' is OFFLINE.` };
    }

    if (metrics.capacity.type === "FIXED") {
      const estimated = params.estimatedBytes || 0;
      if (metrics.capacity.availableBytes - estimated <= this.capacityPolicy.minimumFreeBytes) {
        return {
          allowed: false,
          reason: `Storage node '${this.id}' capacity critical: available bytes ${metrics.capacity.availableBytes} below minimum free ${this.capacityPolicy.minimumFreeBytes}.`,
        };
      }
      if (metrics.capacity.usedPercent >= this.capacityPolicy.stopWritePercent) {
        return {
          allowed: false,
          reason: `Storage node '${this.id}' usage ${metrics.capacity.usedPercent.toFixed(1)}% exceeds stopWrite threshold ${this.capacityPolicy.stopWritePercent}%.`,
        };
      }
    }

    return { allowed: true };
  }

  async runWriteProbe(): Promise<StorageProbeResult> {
    const startedAt = Date.now();
    const probeDir = join(this.recordingRoot, ".write-probe");
    const probePath = join(probeDir, `probe-${Date.now()}-${randomUUID().slice(0, 6)}.bin`);
    const payload = Buffer.from(`sentinel-probe:${Date.now()}:${randomUUID()}`);

    try {
      await writeAtomic(probePath, payload);
      const readBack = await readFile(probePath);
      if (!readBack.equals(payload)) {
        throw new Error("Probe payload read-back mismatch");
      }
      const checksum = createHash("sha256").update(readBack).digest("hex");
      await unlink(probePath).catch(() => undefined);

      this.lastSuccessfulProbe = new Date();
      this.consecutiveFailures = 0;

      return {
        status: "passed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum,
        timestamp: new Date().toISOString(),
      };
    } catch (err: any) {
      await unlink(probePath).catch(() => undefined);
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);

      return {
        status: "failed",
        latencyMs: Date.now() - startedAt,
        bytesWritten: payload.length,
        checksum: "",
        error: err?.message || String(err),
        timestamp: new Date().toISOString(),
      };
    }
  }

  async write(request: StorageWriteRequest): Promise<StorageWriteResult> {
    const check = await this.canAcceptWrite({ estimatedBytes: request.expectedSizeBytes });
    if (!check.allowed) {
      throw new StorageFullError(this.id, this.recordingRoot, new Error(check.reason));
    }

    const relativeTargetPath = this.resolveSegmentTargetPath(
      request.cameraId,
      request.startedAt,
      `${request.segmentId}.mkv`,
    );
    const targetPath = join(this.recordingRoot, relativeTargetPath);
    this.assertInsideRoot(targetPath);

    try {
      // Read local source file and atomic write to final target
      const content = await readFile(request.sourcePath);
      const writeResult = await writeAtomic(targetPath, content, {
        expectedSha256: request.expectedSha256,
        expectedSizeBytes: request.expectedSizeBytes,
      });

      this.lastSuccessfulWrite = new Date();
      this.consecutiveFailures = 0;

      const locator: StorageLocator = {
        kind: "FILESYSTEM",
        path: targetPath,
      };

      return {
        status: "COMMITTED",
        storageNodeId: this.id,
        locator,
        bytesWritten: writeResult.sizeBytes,
        sha256: writeResult.sha256,
        verified: true,
        committedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);
      const errorCode = mapSystemErrorToStorageErrorCode(err);

      if (errorCode === StorageErrorCode.STORAGE_FULL || errorCode === StorageErrorCode.QUOTA_EXCEEDED) {
        throw new StorageFullError(this.id, targetPath, err);
      }

      return {
        status: "FAILED",
        storageNodeId: this.id,
        bytesWritten: 0,
        sha256: null,
        verified: false,
        errorCode,
        error: err?.message || String(err),
      };
    }
  }

  async read(locator: StorageLocator): Promise<NodeJS.ReadableStream> {
    if (locator.kind !== "FILESYSTEM") {
      throw new StorageError(
        StorageErrorCode.STORAGE_IO_ERROR,
        `FilesystemStorageBackend cannot read non-filesystem locator kind '${locator.kind}'.`,
      );
    }
    this.assertInsideRoot(locator.path);
    return createReadStream(locator.path);
  }

  async exists(locator: StorageLocator): Promise<boolean> {
    if (locator.kind !== "FILESYSTEM") return false;
    try {
      this.assertInsideRoot(locator.path);
      const stats = await stat(locator.path);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  async delete(locator: StorageLocator): Promise<void> {
    if (locator.kind !== "FILESYSTEM") {
      throw new StorageError(
        StorageErrorCode.STORAGE_IO_ERROR,
        `FilesystemStorageBackend cannot delete non-filesystem locator kind '${locator.kind}'.`,
      );
    }
    this.assertInsideRoot(locator.path);
    try {
      await unlink(locator.path);
    } catch (err: any) {
      const errorCode = mapSystemErrorToStorageErrorCode(err);
      if (errorCode !== StorageErrorCode.STORAGE_NOT_FOUND) {
        throw new StorageError(errorCode, `Failed to delete file '${locator.path}': ${err.message}`, {
          storageNodeId: this.id,
          pathOrLocator: locator.path,
          originalError: err,
        });
      }
    }
  }

  async verify(locator: StorageLocator): Promise<StorageVerificationResult> {
    const verifiedAt = new Date().toISOString();
    if (locator.kind !== "FILESYSTEM") {
      return {
        valid: false,
        exists: false,
        matchesExpected: false,
        verifiedAt,
        error: `Locator kind '${locator.kind}' is not filesystem.`,
      };
    }

    try {
      this.assertInsideRoot(locator.path);
      const stats = await stat(locator.path);
      if (!stats.isFile()) {
        return {
          valid: false,
          exists: false,
          matchesExpected: false,
          verifiedAt,
          error: "Path is not a regular file.",
        };
      }

      const sha256 = await SegmentChecksum.computeSha256(locator.path);
      return {
        valid: true,
        exists: true,
        sizeBytes: stats.size,
        sha256,
        matchesExpected: true,
        verifiedAt,
      };
    } catch (err: any) {
      return {
        valid: false,
        exists: false,
        matchesExpected: false,
        verifiedAt,
        error: err?.message || String(err),
      };
    }
  }

  resolveSegmentTargetPath(cameraId: string, startedAt: Date, fileName: string): string {
    const safeCam = cameraId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const y = String(startedAt.getUTCFullYear());
    const m = String(startedAt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(startedAt.getUTCDate()).padStart(2, "0");
    const h = String(startedAt.getUTCHours()).padStart(2, "0");
    return join(safeCam, y, m, d, h, fileName);
  }

  protected assertInsideRoot(path: string): void {
    const resolvedPath = resolve(path);
    if (resolvedPath !== this.recordingRoot && !resolvedPath.startsWith(this.recordingRoot + sep)) {
      throw new StorageError(
        StorageErrorCode.STORAGE_PERMISSION_DENIED,
        `Path traversal violation: '${path}' is outside recording root '${this.recordingRoot}'.`,
      );
    }
  }
}
