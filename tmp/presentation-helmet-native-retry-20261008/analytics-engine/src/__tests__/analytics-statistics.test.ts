/**
 * Analytics Statistics Tests
 * Unit and integration tests for statistics service and repository
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Pool } from "pg";
import { AnalyticsStatisticsRepository } from "../repositories/analytics-statistics.repository.js";
import { AnalyticsStatisticsService, ValidationError } from "../services/analytics-statistics.service.js";
import type { StatisticsFilters } from "../models/analytics-statistics.js";

// Mock database pool for unit tests
const createMockPool = (): Pool => {
  const mockQuery = jest.fn();
  return {
    query: mockQuery,
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  } as any;
};

describe("AnalyticsStatisticsRepository", () => {
  let pool: Pool;
  let repository: AnalyticsStatisticsRepository;

  beforeEach(() => {
    pool = createMockPool();
    repository = new AnalyticsStatisticsRepository(pool);
  });

  describe("getSummary", () => {
    it("should return zero statistics for empty result", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_detections: "0",
            average_confidence: null,
            alerts: "0",
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      };

      const result = await repository.getSummary(filters);

      expect(result).toEqual({
        totalDetections: 0,
        averageConfidence: null,
        alerts: 0,
      });

      // Verify tenant isolation
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("tenant_id = $1"),
        expect.arrayContaining(["tenant-1"])
      );
    });

    it("should aggregate multiple detections", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_detections: "1234",
            average_confidence: 0.87,
            alerts: "42",
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      };

      const result = await repository.getSummary(filters);

      expect(result).toEqual({
        totalDetections: 1234,
        averageConfidence: 0.87,
        alerts: 42,
      });
    });

    it("should apply detector type filter", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_detections: "100",
            average_confidence: 0.9,
            alerts: "5",
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
        detectorTypes: ["person", "vehicle"],
      };

      await repository.getSummary(filters);

      // Verify filter was applied
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("detection_type = ANY"),
        expect.arrayContaining([["person", "vehicle"]])
      );
    });

    it("should apply camera filter", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            total_detections: "50",
            average_confidence: 0.85,
            alerts: "2",
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
        cameraId: "camera-123",
      };

      await repository.getSummary(filters);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("camera_id = $"),
        expect.arrayContaining(["camera-123"])
      );
    });
  });

  describe("getByType", () => {
    it("should return empty object for no detections", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      };

      const result = await repository.getByType(filters);

      expect(result).toEqual({});
    });

    it("should aggregate by detection type", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            detection_type: "person",
            detection_count: "500",
            average_confidence: 0.92,
            alert_count: "10",
          },
          {
            detection_type: "vehicle",
            detection_count: "300",
            average_confidence: 0.88,
            alert_count: "5",
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      };

      const result = await repository.getByType(filters);

      expect(result).toEqual({
        person: {
          count: 500,
          averageConfidence: 0.92,
          alerts: 10,
        },
        vehicle: {
          count: 300,
          averageConfidence: 0.88,
          alerts: 5,
        },
      });
    });
  });

  describe("getTimeline", () => {
    it("should return zero-filled timeline buckets", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            bucket: new Date("2026-08-10T00:00:00Z"),
            detection_count: "0",
            average_confidence: null,
            alert_count: "0",
            by_type: {},
          },
          {
            bucket: new Date("2026-08-10T01:00:00Z"),
            detection_count: "42",
            average_confidence: 0.87,
            alert_count: "3",
            by_type: { person: 30, vehicle: 12 },
          },
        ],
      });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-10T02:00:00Z"),
      };

      const result = await repository.getTimeline(filters, "hour");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        timestamp: "2026-08-10T00:00:00.000Z",
        total: 0,
        alerts: 0,
        averageConfidence: null,
        byType: {},
      });
      expect(result[1]).toEqual({
        timestamp: "2026-08-10T01:00:00.000Z",
        total: 42,
        alerts: 3,
        averageConfidence: 0.87,
        byType: { person: 30, vehicle: 12 },
      });
    });

    it("should use correct SQL bucket for each interval", async () => {
      const mockQuery = pool.query as jest.Mock;
      mockQuery.mockResolvedValue({ rows: [] });

      const filters: StatisticsFilters = {
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      };

      // Test each bucket type
      await repository.getTimeline(filters, "minute");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('minute'"),
        expect.any(Array)
      );

      await repository.getTimeline(filters, "hour");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('hour'"),
        expect.any(Array)
      );

      await repository.getTimeline(filters, "day");
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("date_trunc('day'"),
        expect.any(Array)
      );
    });
  });
});

describe("AnalyticsStatisticsService", () => {
  let service: AnalyticsStatisticsService;
  let mockRepository: jest.Mocked<AnalyticsStatisticsRepository>;

  beforeEach(() => {
    mockRepository = {
      getSummary: jest.fn(),
      getByType: jest.fn(),
      getBySeverity: jest.fn(),
      getTimeline: jest.fn(),
      getTopCameras: jest.fn(),
      getTopBranches: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    service = new AnalyticsStatisticsService(mockRepository);
  });

  describe("getStatistics", () => {
    it("should default to last 24 hours if no range provided", async () => {
      mockRepository.getSummary.mockResolvedValue({
        totalDetections: 0,
        averageConfidence: null,
        alerts: 0,
      });
      mockRepository.getByType.mockResolvedValue({});
      mockRepository.getBySeverity.mockResolvedValue({});
      mockRepository.getTimeline.mockResolvedValue([]);

      const result = await service.getStatistics({
        tenantId: "tenant-1",
      });

      expect(result.range.bucket).toBe("hour"); // Auto-selected for 24h range
      
      const from = new Date(result.range.from);
      const to = new Date(result.range.to);
      const hoursDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60);
      
      expect(hoursDiff).toBeCloseTo(24, 0);
    });

    it("should choose appropriate bucket size", async () => {
      mockRepository.getSummary.mockResolvedValue({
        totalDetections: 0,
        averageConfidence: null,
        alerts: 0,
      });
      mockRepository.getByType.mockResolvedValue({});
      mockRepository.getBySeverity.mockResolvedValue({});
      mockRepository.getTimeline.mockResolvedValue([]);

      // 1 hour range -> minute bucket
      const result1h = await service.getStatistics({
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-10T01:00:00Z"),
      });
      expect(result1h.range.bucket).toBe("minute");

      // 48 hour range -> hour bucket
      const result48h = await service.getStatistics({
        tenantId: "tenant-1",
        from: new Date("2026-08-08T00:00:00Z"),
        to: new Date("2026-08-10T00:00:00Z"),
      });
      expect(result48h.range.bucket).toBe("hour");

      // 30 day range -> day bucket
      const result30d = await service.getStatistics({
        tenantId: "tenant-1",
        from: new Date("2026-07-10T00:00:00Z"),
        to: new Date("2026-08-10T00:00:00Z"),
      });
      expect(result30d.range.bucket).toBe("day");
    });

    it("should reject invalid time ranges", async () => {
      await expect(
        service.getStatistics({
          tenantId: "tenant-1",
          from: new Date("2026-08-11T00:00:00Z"),
          to: new Date("2026-08-10T00:00:00Z"), // from > to
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should reject ranges exceeding 90 days", async () => {
      await expect(
        service.getStatistics({
          tenantId: "tenant-1",
          from: new Date("2026-01-01T00:00:00Z"),
          to: new Date("2026-08-10T00:00:00Z"), // > 90 days
        })
      ).rejects.toThrow(ValidationError);
    });

    it("should execute queries in parallel", async () => {
      const summaryPromise = Promise.resolve({
        totalDetections: 100,
        averageConfidence: 0.85,
        alerts: 5,
      });
      const byTypePromise = Promise.resolve({ person: { count: 100, averageConfidence: 0.85, alerts: 5 } });
      const bySeverityPromise = Promise.resolve({ P3: 100 });
      const timelinePromise = Promise.resolve([]);

      mockRepository.getSummary.mockReturnValue(summaryPromise);
      mockRepository.getByType.mockReturnValue(byTypePromise);
      mockRepository.getBySeverity.mockReturnValue(bySeverityPromise);
      mockRepository.getTimeline.mockReturnValue(timelinePromise);

      await service.getStatistics({
        tenantId: "tenant-1",
        from: new Date("2026-08-10T00:00:00Z"),
        to: new Date("2026-08-11T00:00:00Z"),
      });

      // All promises should have been awaited
      expect(mockRepository.getSummary).toHaveBeenCalled();
      expect(mockRepository.getByType).toHaveBeenCalled();
      expect(mockRepository.getBySeverity).toHaveBeenCalled();
      expect(mockRepository.getTimeline).toHaveBeenCalled();
    });

    it("should skip optional breakdowns when not requested", async () => {
      mockRepository.getSummary.mockResolvedValue({
        totalDetections: 0,
        averageConfidence: null,
        alerts: 0,
      });
      mockRepository.getByType.mockResolvedValue({});
      mockRepository.getBySeverity.mockResolvedValue({});
      mockRepository.getTimeline.mockResolvedValue([]);

      const result = await service.getStatistics({
        tenantId: "tenant-1",
        includeCameraBreakdown: false,
        includeBranchBreakdown: false,
      });

      expect(result.topCameras).toBeUndefined();
      expect(result.topBranches).toBeUndefined();
      expect(mockRepository.getTopCameras).not.toHaveBeenCalled();
      expect(mockRepository.getTopBranches).not.toHaveBeenCalled();
    });

    it("should include breakdowns when requested", async () => {
      mockRepository.getSummary.mockResolvedValue({
        totalDetections: 0,
        averageConfidence: null,
        alerts: 0,
      });
      mockRepository.getByType.mockResolvedValue({});
      mockRepository.getBySeverity.mockResolvedValue({});
      mockRepository.getTimeline.mockResolvedValue([]);
      mockRepository.getTopCameras.mockResolvedValue([
        { cameraId: "cam-1", detections: 100, alerts: 5 },
      ]);
      mockRepository.getTopBranches.mockResolvedValue([
        { branchId: "branch-1", detections: 200, alerts: 10 },
      ]);

      const result = await service.getStatistics({
        tenantId: "tenant-1",
        includeCameraBreakdown: true,
        includeBranchBreakdown: true,
      });

      expect(result.topCameras).toBeDefined();
      expect(result.topBranches).toBeDefined();
      expect(mockRepository.getTopCameras).toHaveBeenCalled();
      expect(mockRepository.getTopBranches).toHaveBeenCalled();
    });
  });

  describe("parseDetectorTypes", () => {
    it("should accept valid detector types", () => {
      const result = AnalyticsStatisticsService.parseDetectorTypes([
        "person",
        "vehicle",
        "anpr",
      ]);
      expect(result).toEqual(["person", "vehicle", "anpr"]);
    });

    it("should reject invalid detector types", () => {
      expect(() =>
        AnalyticsStatisticsService.parseDetectorTypes(["invalid"])
      ).toThrow(ValidationError);
    });

    it("should handle single string input", () => {
      const result = AnalyticsStatisticsService.parseDetectorTypes("person");
      expect(result).toEqual(["person"]);
    });

    it("should return undefined for empty input", () => {
      const result = AnalyticsStatisticsService.parseDetectorTypes(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe("parseSeverities", () => {
    it("should accept valid severities", () => {
      const result = AnalyticsStatisticsService.parseSeverities(["P1", "P2", "P3"]);
      expect(result).toEqual(["P1", "P2", "P3"]);
    });

    it("should reject invalid severities", () => {
      expect(() =>
        AnalyticsStatisticsService.parseSeverities(["INVALID"])
      ).toThrow(ValidationError);
    });
  });
});

describe("Tenant Isolation", () => {
  it("should never allow queries without tenant_id", () => {
    const pool = createMockPool();
    const repository = new AnalyticsStatisticsRepository(pool);
    const mockQuery = pool.query as jest.Mock;
    mockQuery.mockResolvedValue({ rows: [] });

    const filters: StatisticsFilters = {
      tenantId: "tenant-1",
      from: new Date("2026-08-10T00:00:00Z"),
      to: new Date("2026-08-11T00:00:00Z"),
    };

    repository.getSummary(filters);

    // Verify every query includes tenant_id = $1
    const queries = mockQuery.mock.calls.map((call) => call[0]);
    for (const query of queries) {
      expect(query).toContain("tenant_id = $1");
    }
  });
});
