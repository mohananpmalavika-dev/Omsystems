/**
 * SMB / CIFS Storage Backend with Reconnect State Machine
 */

import { readdir, stat } from "node:fs/promises";
import { FilesystemStorageBackend, type FilesystemStorageBackendOptions } from "./filesystem-storage.backend.js";
import { StorageError, StorageErrorCode } from "../../../packages/contracts/src/storage/storage-errors.js";
import type { StorageHealth, StorageMetrics, StorageWriteRequest, StorageWriteResult } from "../../../packages/contracts/src/storage/storage-types.js";

export type SmbConnectionState =
  | "CONNECTED"
  | "DEGRADED"
  | "DISCONNECTED"
  | "RECONNECTING"
  | "VERIFYING";

export interface SmbStorageConfig {
  mode: "UNC" | "MOUNTED";
  host?: string;
  share?: string;
  domain?: string;
  username?: string;
  password?: string;
  port?: number;
  mountPath?: string;
  expectedRemote?: string;
}

export class SmbStorageBackend extends FilesystemStorageBackend {
  private connectionState: SmbConnectionState = "CONNECTED";
  private readonly smbConfig: SmbStorageConfig;
  private reconnectAttempts = 0;
  private nextReconnectTime = 0;
  private readonly BACKOFF_INTERVALS_MS = [1000, 2000, 5000, 10000, 20000, 30000];

  constructor(options: FilesystemStorageBackendOptions & { smbConfig: SmbStorageConfig }) {
    const root = options.smbConfig.mode === "UNC" && options.smbConfig.host && options.smbConfig.share
      ? `\\\\${options.smbConfig.host}\\${options.smbConfig.share}`
      : options.smbConfig.mountPath || options.recordingRoot;

    super({
      ...options,
      recordingRoot: root,
      storageType: "smb",
      supportedProtocols: ["smb", "cifs", "posix"],
    });

    this.smbConfig = {
      ...options.smbConfig,
      domain: options.smbConfig.domain || "WORKGROUP",
      username: options.smbConfig.username || process.env.SMB_USERNAME,
      password: options.smbConfig.password || process.env.SMB_PASSWORD,
    };
  }

  getConnectionState(): SmbConnectionState {
    return this.connectionState;
  }

  /**
   * Reconnect state machine with exponential backoff and write probe verification.
   */
  async attemptReconnect(): Promise<boolean> {
    const now = Date.now();
    if (now < this.nextReconnectTime) {
      return false;
    }

    this.connectionState = "RECONNECTING";
    const backoffIndex = Math.min(this.reconnectAttempts, this.BACKOFF_INTERVALS_MS.length - 1);
    const baseDelay = this.BACKOFF_INTERVALS_MS[backoffIndex];
    const jitter = Math.floor(Math.random() * 500);
    this.nextReconnectTime = now + baseDelay + jitter;
    this.reconnectAttempts++;

    try {
      // Step 1: Check share readability
      await stat(this.recordingRoot);
      this.connectionState = "VERIFYING";

      // Step 2: Run write probe and read-back verification
      const probe = await this.runWriteProbe();
      if (probe.status !== "passed") {
        throw new Error(`SMB probe verification failed: ${probe.error || "unknown"}`);
      }

      // Step 3: Reconnected & verified
      this.connectionState = "CONNECTED";
      this.reconnectAttempts = 0;
      this.consecutiveFailures = 0;
      return true;
    } catch (err: any) {
      this.connectionState = "DISCONNECTED";
      this.consecutiveFailures++;
      this.lastError = err?.message || String(err);
      return false;
    }
  }

  override async getHealth(): Promise<StorageHealth> {
    if (this.connectionState === "DISCONNECTED") {
      await this.attemptReconnect().catch(() => undefined);
    }
    const health = await super.getHealth();
    return {
      ...health,
      status: this.connectionState === "CONNECTED" ? health.status : "offline",
      isWritable: this.connectionState === "CONNECTED" && health.isWritable,
      isReadable: this.connectionState === "CONNECTED" && health.isReadable,
    };
  }

  override async canAcceptWrite(params: { estimatedBytes?: number }): Promise<{ allowed: boolean; reason?: string }> {
    if (this.connectionState !== "CONNECTED") {
      const reconnected = await this.attemptReconnect().catch(() => false);
      if (!reconnected) {
        return {
          allowed: false,
          reason: `SMB share '${this.recordingRoot}' is ${this.connectionState}. Reconnect pending.`,
        };
      }
    }
    return super.canAcceptWrite(params);
  }

  override async write(request: StorageWriteRequest): Promise<StorageWriteResult> {
    if (this.connectionState !== "CONNECTED") {
      const reconnected = await this.attemptReconnect().catch(() => false);
      if (!reconnected) {
        throw new StorageError(
          StorageErrorCode.STORAGE_OFFLINE,
          `SMB connection is ${this.connectionState}. Cannot execute write.`,
          { storageNodeId: this.id, pathOrLocator: this.recordingRoot },
        );
      }
    }

    try {
      return await super.write(request);
    } catch (err: any) {
      this.connectionState = "DISCONNECTED";
      this.reconnectAttempts = 0;
      this.nextReconnectTime = Date.now(); // allow immediate first attempt
      throw err;
    }
  }
}
