/**
 * Authoritative Storage Backend Interface
 */

import type {
  StorageBackendKind,
  StorageCapacityPolicy,
  StorageHealth,
  StorageLocator,
  StorageMetrics,
  StorageProbeResult,
  StorageType,
  StorageVerificationResult,
  StorageWriteRequest,
  StorageWriteResult,
} from "../../../packages/contracts/src/storage/storage-types.js";

export interface StorageBackend {
  readonly id: string;
  readonly type: StorageType;
  readonly backendKind: StorageBackendKind;

  getHealth(): Promise<StorageHealth>;
  getMetrics(): Promise<StorageMetrics>;
  runWriteProbe(): Promise<StorageProbeResult>;

  canAcceptWrite(params: { estimatedBytes?: number }): Promise<{ allowed: boolean; reason?: string }>;

  write(request: StorageWriteRequest): Promise<StorageWriteResult>;
  read(locator: StorageLocator): Promise<NodeJS.ReadableStream>;
  exists(locator: StorageLocator): Promise<boolean>;
  delete(locator: StorageLocator): Promise<void>;
  verify(locator: StorageLocator): Promise<StorageVerificationResult>;

  setCapacityPolicy?(policy: Partial<StorageCapacityPolicy>): void;
}
