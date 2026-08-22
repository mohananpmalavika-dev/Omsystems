import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { RecordingSearchService } from "./search-service.js";

describe("RecordingSearchService", () => {
  let mockPool: Pool;
  let mockClient: PoolClient;
  let service: RecordingSearchService;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as unknown as PoolClient;

    mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      query: vi.fn(),
    } as unknown as Pool;

    service = new RecordingSearchService(mockPool);
  });

  describe("searchRecordings", () => {
    it("should search recordings with basic parameters", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          size_bytes: 10000000,
          status: "ready",
          codec: "h264",
          checksum_sha256: "abc123",
        },
      ];

      const mockGaps = [
        {
          start_time: "2024-01-01T10:30:00Z",
          end_time: "2024-01-01T10:45:00Z",
          reason: "camera-offline",
        },
      ];

      const mockEvents = [
        {
          id: "evt-1",
          timestamp: "2024-01-01T10:15:00Z",
          type: "motion",
          title: "Motion detected",
          severity: "info",
        },
      ];

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockGaps } as any)
        .mockResolvedValueOnce({ rows: mockEvents } as any);

      const result = await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
      });

      expect(result.segments).toHaveLength(1);
      expect(result.gaps).toHaveLength(1);
      expect(result.events).toHaveLength(1);
      expect(result.timeline).toBeDefined();
      expect(result.coveragePercent).toBeGreaterThan(0);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it("should filter by event type", async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
        eventType: "person",
      });

      const queryCall = vi.mocked(mockClient.query).mock.calls[0];
      expect(queryCall[0]).toContain("ai_events");
      expect(queryCall[0]).toContain("detection_type");
    });

    it("should filter by motion detection", async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
        hasMotion: true,
      });

      const queryCall = vi.mocked(mockClient.query).mock.calls[0];
      expect(queryCall[0]).toContain("motion_segments");
    });

    it("should filter by minimum duration", async () => {
      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
        minDuration: 300,
      });

      const queryCall = vi.mocked(mockClient.query).mock.calls[0];
      expect(queryCall[0]).toContain("EXTRACT(EPOCH FROM");
      expect(queryCall[1]).toContain(300);
    });

    it("should calculate correct coverage percentage", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          size_bytes: 10000000,
          status: "ready",
        },
      ];

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
      });

      // 30 minutes recorded out of 60 minutes requested = 50%
      expect(result.coveragePercent).toBeCloseTo(50, 0);
      expect(result.recordedSeconds).toBe(1800);
      expect(result.requestedSeconds).toBe(3600);
    });

    it("should generate timeline with segments and gaps", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
          size_bytes: 10000000,
          status: "ready",
        },
      ];

      const mockGaps = [
        {
          start_time: "2024-01-01T10:30:00Z",
          end_time: "2024-01-01T10:45:00Z",
          reason: "camera-offline",
        },
      ];

      vi.mocked(mockClient.query)
        .mockResolvedValueOnce({ rows: mockSegments } as any)
        .mockResolvedValueOnce({ rows: mockGaps } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.searchRecordings({
        cameraId: "cam-1",
        from: "2024-01-01T10:00:00Z",
        to: "2024-01-01T11:00:00Z",
      });

      expect(result.timeline).toHaveLength(2);
      expect(result.timeline[0].type).toBe("recording");
      expect(result.timeline[1].type).toBe("gap");
    });

    it("should release client on error", async () => {
      vi.mocked(mockClient.query).mockRejectedValueOnce(new Error("DB error"));

      await expect(
        service.searchRecordings({
          cameraId: "cam-1",
          from: "2024-01-01T10:00:00Z",
          to: "2024-01-01T11:00:00Z",
        })
      ).rejects.toThrow("DB error");

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe("findSegmentById", () => {
    it("should find segment by ID", async () => {
      const mockSegment = {
        id: "seg-1",
        camera_id: "cam-1",
        started_at: "2024-01-01T10:00:00Z",
        ended_at: "2024-01-01T10:30:00Z",
        size_bytes: 10000000,
        status: "ready",
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockSegment],
      } as any);

      const result = await service.findSegmentById("seg-1");

      expect(result).toEqual(mockSegment);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = $1"),
        ["seg-1"]
      );
    });

    it("should return null when segment not found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.findSegmentById("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getSegmentsByTimeRange", () => {
    it("should get segments within time range", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
        {
          id: "seg-2",
          camera_id: "cam-1",
          started_at: "2024-01-01T10:30:00Z",
          ended_at: "2024-01-01T11:00:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await service.getSegmentsByTimeRange(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("seg-1");
      expect(result[1].id).toBe("seg-2");
    });
  });

  describe("searchByObjectClass", () => {
    it("should search recordings by detected object class", async () => {
      const mockResults = [
        {
          segment_id: "seg-1",
          camera_id: "cam-1",
          detection_time: "2024-01-01T10:15:00Z",
          object_class: "person",
          confidence: 0.95,
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockResults,
      } as any);

      const result = await service.searchByObjectClass(
        "cam-1",
        "person",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result).toHaveLength(1);
      expect(result[0].object_class).toBe("person");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ai_detections"),
        expect.arrayContaining(["cam-1", "person"])
      );
    });

    it("should filter by minimum confidence", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      await service.searchByObjectClass(
        "cam-1",
        "person",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z",
        0.9
      );

      const queryCall = vi.mocked(mockPool.query).mock.calls[0];
      expect(queryCall[0]).toContain("confidence >=");
      expect(queryCall[1]).toContain(0.9);
    });
  });

  describe("getRecordingGaps", () => {
    it("should identify recording gaps", async () => {
      const mockGaps = [
        {
          start_time: "2024-01-01T10:30:00Z",
          end_time: "2024-01-01T10:45:00Z",
          duration_seconds: 900,
          reason: "camera-offline",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockGaps,
      } as any);

      const result = await service.getRecordingGaps(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe("camera-offline");
      expect(result[0].duration_seconds).toBe(900);
    });

    it("should return empty array when no gaps found", async () => {
      vi.mocked(mockPool.query).mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.getRecordingGaps(
        "cam-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("searchByBranch", () => {
    it("should search recordings across all cameras in a branch", async () => {
      const mockSegments = [
        {
          id: "seg-1",
          camera_id: "cam-1",
          camera_name: "Front Entrance",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
        {
          id: "seg-2",
          camera_id: "cam-2",
          camera_name: "Back Exit",
          started_at: "2024-01-01T10:00:00Z",
          ended_at: "2024-01-01T10:30:00Z",
        },
      ];

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: mockSegments,
      } as any);

      const result = await service.searchByBranch(
        "branch-1",
        "2024-01-01T10:00:00Z",
        "2024-01-01T11:00:00Z"
      );

      expect(result).toHaveLength(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("JOIN cameras"),
        expect.arrayContaining(["branch-1"])
      );
    });
  });

  describe("getStorageStatistics", () => {
    it("should calculate storage statistics", async () => {
      const mockStats = {
        total_segments: 100,
        total_size_bytes: 50000000000,
        oldest_segment: "2024-01-01T00:00:00Z",
        newest_segment: "2024-01-10T00:00:00Z",
        avg_segment_size: 500000000,
      };

      vi.mocked(mockPool.query).mockResolvedValueOnce({
        rows: [mockStats],
      } as any);

      const result = await service.getStorageStatistics("cam-1");

      expect(result.total_segments).toBe(100);
      expect(result.total_size_bytes).toBe(50000000000);
      expect(result.oldest_segment).toBeDefined();
    });
  });
});
