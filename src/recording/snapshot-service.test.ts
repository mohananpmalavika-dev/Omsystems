import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Pool } from "pg";
import { SnapshotService } from "./snapshot-service.js";
import * as crypto from "crypto";

describe("SnapshotService", () => {
  let mockPool: Pool;
  let service: SnapshotService;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    service = new SnapshotService(mockPool);
  });

  describe("captureSnapshot", () => {
    it("should capture snapshot from video segment", async () => {
      const mockSnapshot = {
        id: "snap-1",
        segment_id: "seg-1",
        camera_id: "cam-1",
        timestamp_in_segment: 120.5,
        actual_timestamp: "2024-01-01T10:02:00.5Z",
        image_format: "jpeg",
        width: 1920,
        height: 1080,
        size_bytes: 245000,
        checksum_sha256: "abc123def456",
        created_by: "user-1",
        created_at: new Date().toISOString(),
      };

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ started_at: "2024-01-01T10:00:00Z" }] } as any)
        .mockResolvedValueOnce({ rows: [mockSnapshot] } as any);

      const result = await service.captureSnapshot(
        "seg-1",
        "cam-1",
        120.5,
        "user-1",
        Buffer.from("fake-image-data"),
        "case-1"
      );

      expect(result.id).toBe("snap-1");
      expect(result.timestamp_in_segment).toBe(120.5);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it("should calculate SHA-256 hash of image data", async () => {
      const imageData = Buffer.from("test-image-data");
      const expectedHash = crypto.createHash("sha256").update(imageData).digest("hex");

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ started_at: "2024-01-01T10:00:00Z" }] } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: "snap-1",
            checksum_sha256: expectedHash,
          }],
        } as any);

      const result = await service.captureSnapshot(
        "seg-1",
        "cam-1",
        60,
        "user-1",
        imageData
      );

      const insertCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(insertCall[1]).toContain(expectedHash);
    });

    it("should calculate actual timestamp from segment start", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [{ started_at: "2024-01-01T10:00:00Z" }],
        } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: "snap-1",
            actual_timestamp: "2024-01-01T10:01:30Z",
          }],
        } as any);

      await service.captureSnapshot(
        "seg-1",
        "cam-1",
        90, // 90 seconds = 1 minute 30 seconds
        "user-1",
        Buffer.from("data")
      );

      const insertCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(insertCall[0]).toContain("started_at + (");
    });

    it("should store image dimensions and format", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ started_at: "2024-01-01T10:00:00Z" }] } as any)
        .mockResolvedValueOnce({ rows: [{ id: "snap-1" }] } as any);

      await service.captureSnapshot(
        "seg-1",
        "cam-1",
        60,
        "user-1",
        Buffer.from("data"),
        undefined,
        "jpeg",
        1920,
        1080
      );

      const insertCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(insertCall[1]).toContain("jpeg");
      expect(insertCall[1]).toContain(1920);
      expect(insertCall[1]).toContain(1080);
    });

    it("should associate snapshot with evidence case", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ started_at: "2024-01-01T10:00:00Z" }] } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: "snap-1",
            evidence_case_id: "case-1",
          }],
        } as any);

      const result = await service.captureSnapshot(
        "seg-1",
        "cam-1",
        60,
        "user-1",
        Buffer.from("data"),
        "case-1"
      );

      expect(result.evidence_case_id).toBe("case-1");
    });

    it("should throw error if segment not found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      await expect(
        service.captureSnapshot(
          "nonexistent",
          "cam-1",
          60,
          "user-1",
          Buffer.from("data")
        )
      ).rejects.toThrow();
    });
  });

  describe("getSnapshotById", () => {
    it("should retrieve snapshot by ID", async () => {
      const mockSnapshot = {
        id: "snap-1",
        segment_id: "seg-1",
        camera_id: "cam-1",
        timestamp_in_segment: 120.5,
        actual_timestamp: "2024-01-01T10:02:00.5Z",
        checksum_sha256: "abc123",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSnapshot],
      } as any);

      const result = await service.getSnapshotById("snap-1");

      expect(result).toEqual(mockSnapshot);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["snap-1"]
      );
    });

    it("should return null when snapshot not found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.getSnapshotById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getSnapshotsBySegment", () => {
    it("should retrieve all snapshots for a segment", async () => {
      const mockSnapshots = [
        {
          id: "snap-1",
          segment_id: "seg-1",
          timestamp_in_segment: 30,
        },
        {
          id: "snap-2",
          segment_id: "seg-1",
          timestamp_in_segment: 90,
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.getSnapshotsBySegment("seg-1");

      expect(result).toHaveLength(2);
      expect(result[0].timestamp_in_segment).toBe(30);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY timestamp_in_segment"),
        ["seg-1"]
      );
    });
  });

  describe("getSnapshotsByCase", () => {
    it("should retrieve all snapshots for evidence case", async () => {
      const mockSnapshots = [
        {
          id: "snap-1",
          evidence_case_id: "case-1",
          camera_id: "cam-1",
          camera_name: "Front Entrance",
        },
        {
          id: "snap-2",
          evidence_case_id: "case-1",
          camera_id: "cam-2",
          camera_name: "Back Exit",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.getSnapshotsByCase("case-1");

      expect(result).toHaveLength(2);
      expect(result[0].camera_name).toBe("Front Entrance");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("evidence_case_id = $1"),
        ["case-1"]
      );
    });
  });

  describe("verifySnapshotIntegrity", () => {
    it("should verify snapshot integrity using hash", async () => {
      const imageData = Buffer.from("test-image-data");
      const correctHash = crypto.createHash("sha256").update(imageData).digest("hex");

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{
          id: "snap-1",
          checksum_sha256: correctHash,
        }],
      } as any);

      const result = await service.verifySnapshotIntegrity("snap-1", imageData);

      expect(result.isValid).toBe(true);
      expect(result.expectedHash).toBe(correctHash);
      expect(result.actualHash).toBe(correctHash);
    });

    it("should detect tampered snapshot", async () => {
      const originalData = Buffer.from("original-data");
      const tamperedData = Buffer.from("tampered-data");
      const originalHash = crypto.createHash("sha256").update(originalData).digest("hex");

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{
          id: "snap-1",
          checksum_sha256: originalHash,
        }],
      } as any);

      const result = await service.verifySnapshotIntegrity("snap-1", tamperedData);

      expect(result.isValid).toBe(false);
      expect(result.expectedHash).toBe(originalHash);
      expect(result.actualHash).not.toBe(originalHash);
    });

    it("should throw error if snapshot not found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      await expect(
        service.verifySnapshotIntegrity("nonexistent", Buffer.from("data"))
      ).rejects.toThrow("Snapshot not found");
    });
  });

  describe("addSnapshotAnnotation", () => {
    it("should add annotation to snapshot", async () => {
      const mockAnnotation = {
        id: "anno-1",
        snapshot_id: "snap-1",
        annotation_type: "rectangle",
        coordinates: { x: 100, y: 200, width: 50, height: 75 },
        label: "Person of Interest",
        created_by: "user-1",
        created_at: new Date().toISOString(),
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockAnnotation],
      } as any);

      const result = await service.addSnapshotAnnotation(
        "snap-1",
        "rectangle",
        { x: 100, y: 200, width: 50, height: 75 },
        "Person of Interest",
        "user-1"
      );

      expect(result.label).toBe("Person of Interest");
      expect(result.annotation_type).toBe("rectangle");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO snapshot_annotations"),
        expect.arrayContaining(["snap-1", "rectangle"])
      );
    });

    it("should support different annotation types", async () => {
      const types = ["rectangle", "circle", "arrow", "text"];

      for (const type of types) {
        vi.mocked(mockPool.query).mockResolvedValueOnce({
          rows: [{ id: "anno-1", annotation_type: type }],
        } as any);

        const result = await service.addSnapshotAnnotation(
          "snap-1",
          type,
          { x: 0, y: 0 },
          "Test",
          "user-1"
        );

        expect(result.annotation_type).toBe(type);
      }
    });
  });

  describe("getSnapshotAnnotations", () => {
    it("should retrieve all annotations for snapshot", async () => {
      const mockAnnotations = [
        {
          id: "anno-1",
          snapshot_id: "snap-1",
          annotation_type: "rectangle",
          label: "Person 1",
        },
        {
          id: "anno-2",
          snapshot_id: "snap-1",
          annotation_type: "circle",
          label: "Vehicle",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockAnnotations,
      } as any);

      const result = await service.getSnapshotAnnotations("snap-1");

      expect(result).toHaveLength(2);
      expect(result[0].annotation_type).toBe("rectangle");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("snapshot_id = $1"),
        ["snap-1"]
      );
    });
  });

  describe("deleteSnapshot", () => {
    it("should delete snapshot and log action", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "snap-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.deleteSnapshot("snap-1", "user-1", "No longer needed");

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      const deleteCall = vi.mocked(mockPool.query).mock.calls[0];
      expect(deleteCall[0]).toContain("UPDATE forensic_snapshots");
      expect(deleteCall[0]).toContain("deleted_at");
    });

    it("should soft delete by default", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({
          rows: [{
            id: "snap-1",
            deleted_at: new Date().toISOString(),
          }],
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.deleteSnapshot("snap-1", "user-1", "Test");

      const deleteCall = vi.mocked(mockPool.query).mock.calls[0];
      expect(deleteCall[0]).not.toContain("DELETE FROM");
      expect(deleteCall[0]).toContain("UPDATE");
    });

    it("should log deletion in chain of custody", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "snap-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.deleteSnapshot("snap-1", "user-1", "Duplicate");

      const logCall = vi.mocked(mockPool.query).mock.calls[1];
      expect(logCall[0]).toContain("INSERT INTO chain_of_custody");
      expect(logCall[1]).toContain("snapshot_deleted");
    });
  });

  describe("compareSnapshots", () => {
    it("should compare two snapshots", async () => {
      const mockSnapshots = [
        {
          id: "snap-1",
          actual_timestamp: "2024-01-01T10:00:00Z",
          camera_id: "cam-1",
          width: 1920,
          height: 1080,
        },
        {
          id: "snap-2",
          actual_timestamp: "2024-01-01T10:05:00Z",
          camera_id: "cam-1",
          width: 1920,
          height: 1080,
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.compareSnapshots("snap-1", "snap-2");

      expect(result.snapshot1).toEqual(mockSnapshots[0]);
      expect(result.snapshot2).toEqual(mockSnapshots[1]);
      expect(result.timeDifferenceSeconds).toBe(300);
      expect(result.sameCamera).toBe(true);
      expect(result.sameDimensions).toBe(true);
    });

    it("should detect different cameras", async () => {
      const mockSnapshots = [
        { id: "snap-1", camera_id: "cam-1" },
        { id: "snap-2", camera_id: "cam-2" },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.compareSnapshots("snap-1", "snap-2");

      expect(result.sameCamera).toBe(false);
    });
  });

  describe("exportSnapshotsAsZip", () => {
    it("should prepare snapshots for export", async () => {
      const mockSnapshots = [
        {
          id: "snap-1",
          camera_id: "cam-1",
          camera_name: "Front",
          actual_timestamp: "2024-01-01T10:00:00Z",
        },
        {
          id: "snap-2",
          camera_id: "cam-2",
          camera_name: "Back",
          actual_timestamp: "2024-01-01T10:05:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.exportSnapshotsAsZip(["snap-1", "snap-2"]);

      expect(result.snapshots).toHaveLength(2);
      expect(result.manifest).toBeDefined();
      expect(result.manifest.totalSnapshots).toBe(2);
    });

    it("should include metadata in manifest", async () => {
      const mockSnapshots = [
        {
          id: "snap-1",
          checksum_sha256: "abc123",
          created_by: "user-1",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSnapshots,
      } as any);

      const result = await service.exportSnapshotsAsZip(["snap-1"]);

      expect(result.manifest.snapshots[0].checksum_sha256).toBe("abc123");
      expect(result.manifest.exportedAt).toBeDefined();
    });
  });

  describe("getSnapshotStatistics", () => {
    it("should calculate snapshot statistics", async () => {
      const mockStats = {
        total_snapshots: 150,
        total_size_bytes: 36750000,
        by_camera: 5,
        by_case: 12,
        oldest_snapshot: "2024-01-01T00:00:00Z",
        newest_snapshot: "2024-01-10T00:00:00Z",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any);

      const result = await service.getSnapshotStatistics();

      expect(result.total_snapshots).toBe(150);
      expect(result.total_size_bytes).toBe(36750000);
    });

    it("should filter statistics by date range", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ total_snapshots: 50 }],
      } as any);

      await service.getSnapshotStatistics(
        "2024-01-01T00:00:00Z",
        "2024-01-31T23:59:59Z"
      );

      const callArgs = vi.mocked(mockPool.query).mock.calls[0];
      expect(callArgs[0]).toContain("created_at BETWEEN");
    });
  });
});
