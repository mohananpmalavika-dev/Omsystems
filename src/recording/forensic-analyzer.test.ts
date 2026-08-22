import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Pool } from "pg";
import { ForensicAnalyzer } from "./forensic-analyzer.js";
import * as crypto from "crypto";

describe("ForensicAnalyzer", () => {
  let mockPool: Pool;
  let analyzer: ForensicAnalyzer;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    } as unknown as Pool;

    analyzer = new ForensicAnalyzer(mockPool);
  });

  describe("verifySegmentIntegrity", () => {
    it("should verify segment with valid hash", async () => {
      const fileData = Buffer.from("test-video-data");
      const correctHash = crypto.createHash("sha256").update(fileData).digest("hex");

      const mockSegment = {
        id: "seg-1",
        camera_id: "cam-1",
        checksum_sha256: correctHash,
        file_path: "/storage/seg-1.mp4",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSegment],
      } as any);

      const result = await analyzer.verifySegmentIntegrity("seg-1", fileData);

      expect(result.isValid).toBe(true);
      expect(result.expectedHash).toBe(correctHash);
      expect(result.actualHash).toBe(correctHash);
      expect(result.segmentId).toBe("seg-1");
    });

    it("should detect tampered segment", async () => {
      const originalData = Buffer.from("original-video-data");
      const tamperedData = Buffer.from("tampered-video-data");
      const originalHash = crypto.createHash("sha256").update(originalData).digest("hex");

      const mockSegment = {
        id: "seg-1",
        checksum_sha256: originalHash,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSegment],
      } as any);

      const result = await analyzer.verifySegmentIntegrity("seg-1", tamperedData);

      expect(result.isValid).toBe(false);
      expect(result.expectedHash).toBe(originalHash);
      expect(result.actualHash).not.toBe(originalHash);
    });

    it("should throw error if segment not found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [],
      } as any);

      await expect(
        analyzer.verifySegmentIntegrity("nonexistent", Buffer.from("data"))
      ).rejects.toThrow("Segment not found");
    });

    it("should handle segments without hash", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [{ id: "seg-1", checksum_sha256: null }],
      } as any);

      const result = await analyzer.verifySegmentIntegrity(
        "seg-1",
        Buffer.from("data")
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain("No hash available");
    });
  });

  describe("verifyTimestampContinuity", () => {
    it("should verify continuous timeline", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
        {
          id: "seg-2",
          started_at: "2024-01-01T10:30:00Z",
          ended_at: "2024-01-01T11:00:00Z",
        },
        {
          id: "seg-3",
          started_at: "2024-01-01T11:00:00Z",
          ended_at: "2024-01-01T11:30:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await analyzer.verifyTimestampContinuity(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:30:00Z"
      );

      expect(result.isContinuous).toBe(true);
      expect(result.gaps).toHaveLength(0);
      expect(result.totalSegments).toBe(3);
    });

    it("should detect gaps in timeline", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
        {
          id: "seg-2",
          started_at: "2024-01-01T10:45:00Z", // 15 minute gap
          ended_at: "2024-01-01T11:00:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await analyzer.verifyTimestampContinuity(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result.isContinuous).toBe(false);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].durationSeconds).toBe(900); // 15 minutes
      expect(result.gaps[0].startTime).toBe("2024-01-01T10:30:00Z");
      expect(result.gaps[0].endTime).toBe("2024-01-01T10:45:00Z");
    });

    it("should identify overlapping segments", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:35:00Z",
        },
        {
          id: "seg-2",
          started_at: "2024-01-01T10:30:00Z", // 5 minute overlap
          ended_at: "2024-01-01T11:00:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await analyzer.verifyTimestampContinuity(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result.overlaps).toHaveLength(1);
      expect(result.overlaps[0].durationSeconds).toBe(300); // 5 minutes
    });

    it("should calculate coverage percentage", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z", // 30 minutes
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await analyzer.verifyTimestampContinuity(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z" // 60 minutes total
      );

      expect(result.coveragePercent).toBe(50);
    });
  });

  describe("verifyChainOfCustody", () => {
    it("should verify complete chain of custody", async () => {
      const mockEvents = [
        {
          id: "evt-1",
          segment_id: "seg-1",
          action: "recording_started",
          actor: "system",
          timestamp: "2024-01-01T10:00:00Z",
          previous_hash: null,
          current_hash: "hash1",
        },
        {
          id: "evt-2",
          segment_id: "seg-1",
          action: "recording_completed",
          actor: "system",
          timestamp: "2024-01-01T10:30:00Z",
          previous_hash: "hash1",
          current_hash: "hash2",
        },
        {
          id: "evt-3",
          segment_id: "seg-1",
          action: "playback_accessed",
          actor: "user-1",
          timestamp: "2024-01-01T11:00:00Z",
          previous_hash: "hash2",
          current_hash: "hash3",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockEvents,
      } as any);

      const result = await analyzer.verifyChainOfCustody("seg-1");

      expect(result.isValid).toBe(true);
      expect(result.totalEvents).toBe(3);
      expect(result.brokenLinks).toHaveLength(0);
    });

    it("should detect broken chain links", async () => {
      const mockEvents = [
        {
          id: "evt-1",
          action: "recording_started",
          previous_hash: null,
          current_hash: "hash1",
        },
        {
          id: "evt-2",
          action: "recording_completed",
          previous_hash: "hash1",
          current_hash: "hash2",
        },
        {
          id: "evt-3",
          action: "playback_accessed",
          previous_hash: "wrong_hash", // Broken link
          current_hash: "hash3",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockEvents,
      } as any);

      const result = await analyzer.verifyChainOfCustody("seg-1");

      expect(result.isValid).toBe(false);
      expect(result.brokenLinks).toHaveLength(1);
      expect(result.brokenLinks[0].eventId).toBe("evt-3");
    });

    it("should verify hash chain integrity", async () => {
      const event1 = {
        id: "evt-1",
        action: "recording_started",
        data: { camera: "cam-1" },
        previous_hash: null,
      };
      const event1Hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(event1))
        .digest("hex");

      const mockEvents = [
        { ...event1, current_hash: event1Hash },
        {
          id: "evt-2",
          action: "recording_completed",
          previous_hash: event1Hash,
          current_hash: "hash2",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockEvents,
      } as any);

      const result = await analyzer.verifyChainOfCustody("seg-1");

      expect(result.isValid).toBe(true);
    });
  });

  describe("generateForensicReport", () => {
    it("should generate comprehensive forensic report", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          camera_name: "Front Entrance",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          checksum_sha256: "abc123",
        },
      ];

      const mockCustodyEvents = [
        {
          id: "evt-1",
          action: "recording_started",
          actor: "system",
          timestamp: "2024-01-01T10:00:00Z",
        },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockCustodyEvents } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const report = await analyzer.generateForensicReport(
        ["seg-1"],
        "user-1",
        "case-1"
      );

      expect(report.id).toBeDefined();
      expect(report.segments).toHaveLength(1);
      expect(report.verificationChecks).toBeDefined();
      expect(report.chainOfCustody).toHaveLength(1);
      expect(report.summary).toBeDefined();
    });

    it("should include all verification checks", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const report = await analyzer.generateForensicReport(["seg-1"], "user-1");

      expect(report.verificationChecks.hashIntegrity).toBeDefined();
      expect(report.verificationChecks.timestampContinuity).toBeDefined();
      expect(report.verificationChecks.chainOfCustody).toBeDefined();
      expect(report.verificationChecks.metadataIntegrity).toBeDefined();
    });

    it("should calculate summary statistics", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          checksum_sha256: "valid",
        },
        {
          id: "seg-2",
          started_at: "2024-01-01T10:30:00Z",
          ended_at: "2024-01-01T11:00:00Z",
          checksum_sha256: "valid",
        },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const report = await analyzer.generateForensicReport(
        ["seg-1", "seg-2"],
        "user-1"
      );

      expect(report.summary.totalSegments).toBe(2);
      expect(report.summary.verifiedSegments).toBeGreaterThanOrEqual(0);
      expect(report.summary.totalDurationSeconds).toBe(3600);
    });

    it("should set overall status based on checks", async () => {
      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1", checksum_sha256: "valid" }] } as any)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const report = await analyzer.generateForensicReport(["seg-1"], "user-1");

      expect(report.summary.overallStatus).toMatch(/passed|warning|failed/);
    });
  });

  describe("detectAnomalies", () => {
    it("should detect unusual file sizes", async () => {
      const mockSegments = [
        { id: "seg-1", size_bytes: 10000000, duration_seconds: 1800 },
        { id: "seg-2", size_bytes: 100000, duration_seconds: 1800 }, // Unusually small
        { id: "seg-3", size_bytes: 10000000, duration_seconds: 1800 },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const anomalies = await analyzer.detectAnomalies("cam-1");

      const sizeAnomalies = anomalies.filter((a) => a.type === "file_size");
      expect(sizeAnomalies.length).toBeGreaterThan(0);
    });

    it("should detect missing segments", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
        {
          id: "seg-2",
          started_at: "2024-01-01T11:00:00Z", // 30 minute gap
          ended_at: "2024-01-01T11:30:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const anomalies = await analyzer.detectAnomalies("cam-1");

      const gapAnomalies = anomalies.filter((a) => a.type === "recording_gap");
      expect(gapAnomalies.length).toBeGreaterThan(0);
    });

    it("should detect segments without hashes", async () => {
      const mockSegments = [
        { id: "seg-1", checksum_sha256: "valid" },
        { id: "seg-2", checksum_sha256: null }, // Missing hash
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const anomalies = await analyzer.detectAnomalies("cam-1");

      const hashAnomalies = anomalies.filter((a) => a.type === "missing_hash");
      expect(hashAnomalies.length).toBeGreaterThan(0);
    });

    it("should detect timestamp inconsistencies", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:30:00Z",
          ended_at: "2024-01-01T10:00:00Z", // End before start!
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const anomalies = await analyzer.detectAnomalies("cam-1");

      const timestampAnomalies = anomalies.filter(
        (a) => a.type === "timestamp_error"
      );
      expect(timestampAnomalies.length).toBeGreaterThan(0);
    });
  });

  describe("compareSegmentVersions", () => {
    it("should compare two versions of the same segment", async () => {
      const mockVersions = [
        {
          id: "seg-1",
          version: 1,
          checksum_sha256: "hash1",
          size_bytes: 10000000,
          modified_at: "2024-01-01T10:00:00Z",
        },
        {
          id: "seg-1",
          version: 2,
          checksum_sha256: "hash2",
          size_bytes: 10000100,
          modified_at: "2024-01-01T10:30:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockVersions,
      } as any);

      const result = await analyzer.compareSegmentVersions("seg-1", 1, 2);

      expect(result.version1.checksum_sha256).toBe("hash1");
      expect(result.version2.checksum_sha256).toBe("hash2");
      expect(result.hashChanged).toBe(true);
      expect(result.sizeChanged).toBe(true);
    });

    it("should detect identical versions", async () => {
      const mockVersions = [
        {
          id: "seg-1",
          version: 1,
          checksum_sha256: "same-hash",
          size_bytes: 10000000,
        },
        {
          id: "seg-1",
          version: 2,
          checksum_sha256: "same-hash",
          size_bytes: 10000000,
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockVersions,
      } as any);

      const result = await analyzer.compareSegmentVersions("seg-1", 1, 2);

      expect(result.hashChanged).toBe(false);
      expect(result.sizeChanged).toBe(false);
    });
  });

  describe("auditRecordingSession", () => {
    it("should audit recording session for compliance", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          checksum_sha256: "valid",
        },
      ];

      const mockAccessLog = [
        {
          user_id: "user-1",
          action: "playback",
          timestamp: "2024-01-01T11:00:00Z",
        },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockAccessLog } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const audit = await analyzer.auditRecordingSession(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T10:30:00Z"
      );

      expect(audit.segments).toHaveLength(1);
      expect(audit.accessLog).toHaveLength(1);
      expect(audit.complianceStatus).toBeDefined();
    });

    it("should check for required retention periods", async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      const mockSegments = [
        {
          id: "seg-1",
          started_at: oldDate.toISOString(),
          retention_days: 90,
        },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const audit = await analyzer.auditRecordingSession("cam-1", oldDate.toISOString(), new Date().toISOString());

      expect(audit.retentionViolations).toBeDefined();
    });
  });

  describe("verifyExportIntegrity", () => {
    it("should verify exported evidence integrity", async () => {
      const mockExport = {
        id: "export-1",
        segment_ids: ["seg-1", "seg-2"],
        manifest_hash: "manifest-hash",
        created_at: "2024-01-01T12:00:00Z",
      };

      const mockSegments = [
        { id: "seg-1", checksum_sha256: "hash1" },
        { id: "seg-2", checksum_sha256: "hash2" },
      ];

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockExport] } as any)
        .mockResolvedValueOnce({ rows: mockSegments } as any);

      const result = await analyzer.verifyExportIntegrity("export-1");

      expect(result.exportId).toBe("export-1");
      expect(result.segmentsVerified).toBe(2);
      expect(result.isValid).toBeDefined();
    });

    it("should detect tampered exports", async () => {
      const mockExport = {
        id: "export-1",
        segment_ids: ["seg-1"],
        manifest_hash: "original-manifest-hash",
      };

      vi.mocked(mockPool.query)
        .mockResolvedValueOnce({ rows: [mockExport] } as any)
        .mockResolvedValueOnce({ rows: [{ id: "seg-1" }] } as any);

      const result = await analyzer.verifyExportIntegrity(
        "export-1",
        "tampered-manifest-hash"
      );

      expect(result.isValid).toBe(false);
      expect(result.manifestHashMatch).toBe(false);
    });
  });
});
