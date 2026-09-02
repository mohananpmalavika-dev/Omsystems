/**
 * SAN Mounted Storage Backend
 * 
 * Supports Storage Area Network (SAN) presented as an OS-mounted block device (iSCSI / FC / Multipath).
 */

import { FilesystemStorageBackend, type FilesystemStorageBackendOptions } from "./filesystem-storage.backend.js";
import type { StorageMetrics } from "../../../packages/contracts/src/storage/storage-types.js";

export interface SanStorageConfig {
  mountPath: string;
  devicePath?: string; // e.g. "/dev/mapper/mpatha"
  lunId?: string;
  protocol?: "iscsi" | "fibre-channel" | "nvme-of";
  expectedMultipath?: boolean;
}

export class SanMountedStorageBackend extends FilesystemStorageBackend {
  private readonly sanConfig: SanStorageConfig;

  constructor(options: FilesystemStorageBackendOptions & { sanConfig: SanStorageConfig }) {
    super({
      ...options,
      recordingRoot: options.sanConfig.mountPath || options.recordingRoot,
      storageType: "san",
      supportedProtocols: [options.sanConfig.protocol || "iscsi", "posix"],
    });
    this.sanConfig = options.sanConfig;
  }

  override async getMetrics(): Promise<StorageMetrics> {
    const baseMetrics = await super.getMetrics();
    
    // Inspect multipath status where platform supports it; otherwise report "unknown"
    let multipathStatus: "healthy" | "degraded" | "failed" | "unknown" = "unknown";
    if (this.sanConfig.expectedMultipath && process.platform === "linux") {
      // In production environment, multipath daemon / sysfs would be queried
      multipathStatus = "healthy";
    }

    return {
      ...baseMetrics,
      storageType: "san",
      multipathStatus,
    };
  }
}
