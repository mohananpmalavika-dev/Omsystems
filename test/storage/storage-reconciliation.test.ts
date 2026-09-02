import { describe, it, expect, vi } from "vitest";
import { StorageReconciliationService } from "../../recording-engine/src/recovery/storage-reconciliation.service.js";
import { StorageIntegrityScrubber } from "../../recording-engine/src/recovery/storage-integrity-scrubber.js";
import type { StorageBackend } from "../../recording-engine/src/backends/storage-backend.interface.js";
import type { CanonicalRecordingIndexRecord } from "../../packages/contracts/src/storage/storage-types.js";

describe("Storage Reconciliation & Cryptographic Scrubbing", () => {
  describe("Storage Reconciliation Service", () => {
    it("detects INDEX_ONLY, SIZE_MISMATCH, and CHECKSUM_MISMATCH discrepancies", async () => {
      const mockBackend: Partial<StorageBackend> = {
        verify: vi.fn().mockImplementation(async (locator: any) => {
          if (locator.path.includes("missing")) {
            return { valid: false, exists: false, matchesExpected: false, verifiedAt: new Date().toISOString() };
          }
          if (locator.path.includes("size-diff")) {
            return {
              valid: true,
              exists: true,
              sizeBytes: 9999, // mismatch vs index 2048
              sha256: "sha256-matching",
              matchesExpected: true,
              verifiedAt: new Date().toISOString(),
            };
          }
          if (locator.path.includes("corrupt-hash")) {
            return {
              valid: true,
              exists: true,
              sizeBytes: 2048,
              sha256: "sha256-actual-corrupt", // mismatch vs index expected
              matchesExpected: false,
              verifiedAt: new Date().toISOString(),
            };
          }
          return {
            valid: true,
            exists: true,
            sizeBytes: 2048,
            sha256: "sha256-valid",
            matchesExpected: true,
            verifiedAt: new Date().toISOString(),
          };
        }),
      };

      const reconciler = new StorageReconciliationService(mockBackend as any);

      const records: CanonicalRecordingIndexRecord[] = [
        {
          segmentId: "seg-1-valid",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/valid.mkv" },
          sizeBytes: 2048,
          sha256: "sha256-valid",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
        {
          segmentId: "seg-2-missing",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/missing.mkv" },
          sizeBytes: 2048,
          sha256: "sha256-valid",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
        {
          segmentId: "seg-3-size",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/size-diff.mkv" },
          sizeBytes: 2048,
          sha256: "sha256-matching",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
        {
          segmentId: "seg-4-corrupt",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/corrupt-hash.mkv" },
          sizeBytes: 2048,
          sha256: "sha256-expected",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
      ];

      const result = await reconciler.reconcileRecords(records);
      expect(result.totalChecked).toBe(4);
      expect(result.matchedCount).toBe(1);
      expect(result.discrepancyCount).toBe(3);

      expect(result.discrepancies.some((d) => d.type === "INDEX_ONLY")).toBe(true);
      expect(result.discrepancies.some((d) => d.type === "SIZE_MISMATCH")).toBe(true);
      expect(result.discrepancies.some((d) => d.type === "CHECKSUM_MISMATCH")).toBe(true);
    });
  });

  describe("Storage Integrity Scrubber", () => {
    it("scrubs sample of segments and catches bitrot corruption", async () => {
      const mockBackend: Partial<StorageBackend> = {
        verify: vi.fn().mockImplementation(async (locator: any) => {
          if (locator.path.includes("bitrot")) {
            return {
              valid: true,
              exists: true,
              sha256: "sha256-bitrot-corrupted",
              matchesExpected: false,
              verifiedAt: new Date().toISOString(),
            };
          }
          return {
            valid: true,
            exists: true,
            sha256: "sha256-clean",
            matchesExpected: true,
            verifiedAt: new Date().toISOString(),
          };
        }),
      };

      const scrubber = new StorageIntegrityScrubber(mockBackend as any);

      const records: CanonicalRecordingIndexRecord[] = [
        {
          segmentId: "seg-clean-1",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/clean.mkv" },
          sizeBytes: 1000,
          sha256: "sha256-clean",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
        {
          segmentId: "seg-corrupted-2",
          recordingId: "rec-1",
          cameraId: "cam-1",
          tenantId: "t1",
          branchId: "b1",
          startTimestamp: new Date().toISOString(),
          endTimestamp: new Date().toISOString(),
          storageNodeId: "node-1",
          storageBackendType: "local-disk",
          storageLocator: { kind: "FILESYSTEM", path: "/storage/bitrot.mkv" },
          sizeBytes: 1000,
          sha256: "sha256-original-expected",
          storageState: "COMMITTED",
          legalHold: false,
          createdAt: new Date().toISOString(),
        },
      ];

      const report = await scrubber.scrubSample(records, 1.0);
      expect(report.totalSampled).toBe(2);
      expect(report.validCount).toBe(1);
      expect(report.corruptedCount).toBe(1);
      expect(report.corruptedSegments[0]!.segmentId).toBe("seg-corrupted-2");
    });
  });
});
