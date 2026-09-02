import { describe, it, expect } from "vitest";
import {
  StorageErrorCode,
  StorageError,
  LegalHoldProtectedError,
  StorageFullError,
  MountDisappearedError,
  StorageChecksumMismatchError,
  mapSystemErrorToStorageErrorCode,
} from "../../packages/contracts/src/storage/storage-errors.js";
import {
  DEFAULT_STORAGE_CAPACITY_POLICY,
  type StorageCapacity,
  type StorageLocator,
} from "../../packages/contracts/src/storage/storage-types.js";

describe("Canonical Storage Contracts & Errors", () => {
  describe("Storage Locator", () => {
    it("differentiates filesystem and S3 storage locators", () => {
      const fsLocator: StorageLocator = {
        kind: "FILESYSTEM",
        path: "/var/lib/sentinel/recordings/cam-1/segment.mkv",
      };
      expect(fsLocator.kind).toBe("FILESYSTEM");
      expect(fsLocator.path).toBeDefined();

      const s3Locator: StorageLocator = {
        kind: "S3",
        bucket: "sentinel-recordings-prod",
        key: "recordings/cam-1/2026/09/02/segment.mkv",
        versionId: "v-12345",
      };
      expect(s3Locator.kind).toBe("S3");
      expect(s3Locator.bucket).toBe("sentinel-recordings-prod");
      expect(s3Locator.versionId).toBe("v-12345");
    });
  });

  describe("Storage Capacity Semantics", () => {
    it("models fixed filesystem capacity with usage percentage", () => {
      const fixed: StorageCapacity = {
        type: "FIXED",
        totalBytes: 1000,
        usedBytes: 850,
        availableBytes: 150,
        usedPercent: 85,
      };
      expect(fixed.type).toBe("FIXED");
      expect(fixed.usedPercent).toBe(85);
    });

    it("models elastic S3 capacity without fake numeric limits", () => {
      const elastic: StorageCapacity = {
        type: "ELASTIC",
        totalBytes: null,
        usedBytes: 54321000,
        availableBytes: null,
      };
      expect(elastic.type).toBe("ELASTIC");
      expect(elastic.totalBytes).toBeNull();
      expect(elastic.availableBytes).toBeNull();
      expect(elastic.usedBytes).toBe(54321000);
    });

    it("defines standard capacity watermarks (80% warn, 90% crit, 95% stop)", () => {
      expect(DEFAULT_STORAGE_CAPACITY_POLICY.warningPercent).toBe(80);
      expect(DEFAULT_STORAGE_CAPACITY_POLICY.criticalPercent).toBe(90);
      expect(DEFAULT_STORAGE_CAPACITY_POLICY.stopWritePercent).toBe(95);
      expect(DEFAULT_STORAGE_CAPACITY_POLICY.reserveBytes).toBeGreaterThan(0);
    });
  });

  describe("Typed Storage Errors", () => {
    it("maps OS error codes to StorageErrorCode", () => {
      expect(mapSystemErrorToStorageErrorCode({ code: "ENOSPC" })).toBe(StorageErrorCode.STORAGE_FULL);
      expect(mapSystemErrorToStorageErrorCode({ code: "EDQUOT" })).toBe(StorageErrorCode.QUOTA_EXCEEDED);
      expect(mapSystemErrorToStorageErrorCode({ code: "EROFS" })).toBe(StorageErrorCode.STORAGE_READ_ONLY);
      expect(mapSystemErrorToStorageErrorCode({ code: "EACCES" })).toBe(StorageErrorCode.STORAGE_PERMISSION_DENIED);
      expect(mapSystemErrorToStorageErrorCode({ code: "ENOENT" })).toBe(StorageErrorCode.STORAGE_NOT_FOUND);
      expect(mapSystemErrorToStorageErrorCode({ code: "EHOSTUNREACH" })).toBe(StorageErrorCode.STORAGE_OFFLINE);
      expect(mapSystemErrorToStorageErrorCode({ code: "EIO" })).toBe(StorageErrorCode.STORAGE_IO_ERROR);
    });

    it("instantiates LegalHoldProtectedError", () => {
      const err = new LegalHoldProtectedError("seg-999", "LH-CASE-1");
      expect(err.name).toBe("LegalHoldProtectedError");
      expect(err.code).toBe(StorageErrorCode.LEGAL_HOLD_PROTECTED);
      expect(err.segmentId).toBe("seg-999");
      expect(err.holdId).toBe("LH-CASE-1");
      expect(err.message).toContain("protected by active Legal Hold");
    });

    it("instantiates MountDisappearedError", () => {
      const err = new MountDisappearedError("/mnt/nfs/recordings", "10.0.0.1:/vol1");
      expect(err.name).toBe("MountDisappearedError");
      expect(err.code).toBe(StorageErrorCode.MOUNT_DISAPPEARED);
      expect(err.message).toContain("has disappeared");
    });

    it("instantiates StorageChecksumMismatchError", () => {
      const err = new StorageChecksumMismatchError("abc123expected", "def456actual");
      expect(err.name).toBe("StorageChecksumMismatchError");
      expect(err.code).toBe(StorageErrorCode.STORAGE_CHECKSUM_MISMATCH);
      expect(err.expectedSha256).toBe("abc123expected");
      expect(err.actualSha256).toBe("def456actual");
    });
  });
});
