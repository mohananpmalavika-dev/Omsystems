/**
 * Storage Reconciliation Service
 * 
 * Reconciles authoritative RecordingIndex records against physical storage artifacts.
 */

import type { StorageBackend } from "../backends/storage-backend.interface.js";
import type { CanonicalRecordingIndexRecord } from "../../../packages/contracts/src/storage/storage-types.js";

export type DiscrepancyType =
  | "INDEX_ONLY"
  | "STORAGE_ONLY"
  | "CHECKSUM_MISMATCH"
  | "SIZE_MISMATCH"
  | "CORRUPT";

export interface ReconciliationDiscrepancy {
  type: DiscrepancyType;
  segmentId?: string;
  storageLocator?: any;
  expectedSha256?: string;
  actualSha256?: string;
  expectedSizeBytes?: number;
  actualSizeBytes?: number;
  details: string;
}

export interface ReconciliationResult {
  totalChecked: number;
  matchedCount: number;
  discrepancyCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  reconciledAt: string;
}

export class StorageReconciliationService {
  constructor(private readonly backend: StorageBackend) {}

  /**
   * Reconciles a list of database recording records against actual storage backend files.
   */
  async reconcileRecords(records: CanonicalRecordingIndexRecord[]): Promise<ReconciliationResult> {
    const discrepancies: ReconciliationDiscrepancy[] = [];
    let matchedCount = 0;

    for (const record of records) {
      try {
        const verification = await this.backend.verify(record.storageLocator);

        if (!verification.exists) {
          discrepancies.push({
            type: "INDEX_ONLY",
            segmentId: record.segmentId,
            storageLocator: record.storageLocator,
            details: `Segment '${record.segmentId}' exists in index but missing on storage.`,
          });
          continue;
        }

        if (record.sizeBytes && verification.sizeBytes !== undefined && record.sizeBytes !== verification.sizeBytes) {
          discrepancies.push({
            type: "SIZE_MISMATCH",
            segmentId: record.segmentId,
            storageLocator: record.storageLocator,
            expectedSizeBytes: record.sizeBytes,
            actualSizeBytes: verification.sizeBytes,
            details: `Segment size mismatch: index=${record.sizeBytes} vs physical=${verification.sizeBytes}`,
          });
          continue;
        }

        if (record.sha256 && verification.sha256 && record.sha256.toLowerCase() !== verification.sha256.toLowerCase()) {
          discrepancies.push({
            type: "CHECKSUM_MISMATCH",
            segmentId: record.segmentId,
            storageLocator: record.storageLocator,
            expectedSha256: record.sha256,
            actualSha256: verification.sha256,
            details: `Checksum mismatch: index=${record.sha256} vs physical=${verification.sha256}`,
          });
          continue;
        }

        matchedCount++;
      } catch (err: any) {
        discrepancies.push({
          type: "CORRUPT",
          segmentId: record.segmentId,
          storageLocator: record.storageLocator,
          details: `Error inspecting storage: ${err?.message || String(err)}`,
        });
      }
    }

    return {
      totalChecked: records.length,
      matchedCount,
      discrepancyCount: discrepancies.length,
      discrepancies,
      reconciledAt: new Date().toISOString(),
    };
  }
}
