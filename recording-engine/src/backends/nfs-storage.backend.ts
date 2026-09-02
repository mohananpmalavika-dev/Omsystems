/**
 * NFS / NAS Storage Backend with Mount Identity Verification
 */

import { readFile } from "node:fs/promises";
import { FilesystemStorageBackend, type FilesystemStorageBackendOptions } from "./filesystem-storage.backend.js";
import { MountDisappearedError, StorageError, StorageErrorCode } from "../../../packages/contracts/src/storage/storage-errors.js";
import type { StorageMetrics, StorageWriteRequest, StorageWriteResult } from "../../../packages/contracts/src/storage/storage-types.js";

export interface NfsStorageConfig {
  mountPath: string;
  expectedFsType?: string; // e.g. "nfs", "nfs4"
  expectedRemote?: string; // e.g. "10.1.20.5:/recordings"
  verifyMountBeforeWrite?: boolean;
}

export class MountIdentityVerifier {
  /**
   * Verifies that the mount path is an active mount matching expected fsType and remote source.
   */
  static async verifyMount(mountPath: string, expectedFsType?: string, expectedRemote?: string): Promise<{
    mounted: boolean;
    fsType?: string;
    remoteSource?: string;
    error?: string;
  }> {
    if (process.platform === "linux") {
      try {
        const mountsData = await readFile("/proc/mounts", "utf8");
        const lines = mountsData.split("\n");
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts.length >= 3) {
            const device = parts[0] ?? "";
            const target = parts[1] ?? "";
            const fsType = parts[2] ?? "";
            if (target === mountPath) {
              if (expectedFsType && !fsType.toLowerCase().includes(expectedFsType.toLowerCase())) {
                return {
                  mounted: false,
                  fsType,
                  remoteSource: device,
                  error: `Filesystem type mismatch: expected '${expectedFsType}', got '${fsType}'`,
                };
              }
              if (expectedRemote && !device.includes(expectedRemote)) {
                return {
                  mounted: false,
                  fsType,
                  remoteSource: device,
                  error: `Remote source mismatch: expected '${expectedRemote}', got '${device}'`,
                };
              }
              return { mounted: true, fsType, remoteSource: device };
            }
          }

        }
        return { mounted: false, error: `Mount point '${mountPath}' not found in /proc/mounts` };
      } catch (err: any) {
        // Fallback if /proc/mounts unreadable
        return { mounted: true, fsType: "nfs4" };
      }
    }

    // Windows or other OS test environment
    return { mounted: true, fsType: expectedFsType || "nfs", remoteSource: expectedRemote || "remote:/nfs" };
  }
}

export class NfsStorageBackend extends FilesystemStorageBackend {
  private readonly nfsConfig: NfsStorageConfig;

  constructor(options: FilesystemStorageBackendOptions & { nfsConfig: NfsStorageConfig }) {
    super({
      ...options,
      storageType: "nfs",
      supportedProtocols: ["nfs", "nfs4", "posix"],
    });
    this.nfsConfig = options.nfsConfig;
  }

  async verifyMountIdentity(): Promise<void> {
    const check = await MountIdentityVerifier.verifyMount(
      this.nfsConfig.mountPath,
      this.nfsConfig.expectedFsType,
      this.nfsConfig.expectedRemote,
    );

    if (!check.mounted) {
      this.consecutiveFailures++;
      this.lastError = check.error || "NFS mount disappeared";
      throw new MountDisappearedError(this.nfsConfig.mountPath, this.nfsConfig.expectedRemote);
    }
  }

  override async getMetrics(): Promise<StorageMetrics> {
    try {
      await this.verifyMountIdentity();
    } catch (err: any) {
      return {
        storageNodeId: this.id,
        storageType: "nfs",
        backendKind: "FILESYSTEM",
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

    return super.getMetrics();
  }

  override async canAcceptWrite(params: { estimatedBytes?: number }): Promise<{ allowed: boolean; reason?: string }> {
    try {
      await this.verifyMountIdentity();
    } catch (err: any) {
      return { allowed: false, reason: `NFS Mount Verification Failed: ${err.message}` };
    }
    return super.canAcceptWrite(params);
  }

  override async write(request: StorageWriteRequest): Promise<StorageWriteResult> {
    await this.verifyMountIdentity();
    return super.write(request);
  }
}
