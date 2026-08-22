import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { TimelineAggregationService } from "../../src/investigation/timeline-aggregation.service.js";
import { InvestigationSearchService } from "../../src/investigation/investigation-search.service.js";
import { registerRecordingIndexRoutes } from "../../src/routes/recording-index.routes.js";
import { registerInvestigationRoutes } from "../../src/routes/investigation.routes.js";
import type { DbInvestigationEvent } from "../../src/domain/models.js";

describe("Investigation & Timeline Search Subsystem Suite", () => {
  describe("1. Resolution-Aware Timeline Aggregation", () => {
    const aggregationService = new TimelineAggregationService();

    it("buckets 1-hour window into 60-second intervals with event categorization", () => {
      const from = new Date("2026-08-17T14:00:00Z");
      const to = new Date("2026-08-17T15:00:00Z"); // 60 minutes = 60 buckets

      const mockEvents: DbInvestigationEvent[] = [
        {
          id: "ev-1",
          tenantId: "tenant-1",
          cameraId: "cam-vault-01",
          eventType: "motion.started",
          severity: "INFO",
          startTime: "2026-08-17T14:00:15.000Z", // In bucket 0
          metadata: {},
          createdAt: "2026-08-17T14:00:15.000Z",
        },
        {
          id: "ev-2",
          tenantId: "tenant-1",
          cameraId: "cam-vault-01",
          eventType: "person.detected",
          objectType: "PERSON",
          severity: "MEDIUM",
          startTime: "2026-08-17T14:00:30.000Z", // In bucket 0
          metadata: {},
          createdAt: "2026-08-17T14:00:30.000Z",
        },
        {
          id: "ev-3",
          tenantId: "tenant-1",
          deviceId: "door-vault-01",
          eventType: "door.opened",
          severity: "HIGH",
          startTime: "2026-08-17T14:05:10.000Z", // In bucket 5
          metadata: {},
          createdAt: "2026-08-17T14:05:10.000Z",
        },
        {
          id: "ev-4",
          tenantId: "tenant-1",
          cameraId: "cam-vault-01",
          eventType: "alert.created",
          severity: "CRITICAL",
          startTime: "2026-08-17T14:05:25.000Z", // In bucket 5
          metadata: {},
          createdAt: "2026-08-17T14:05:25.000Z",
        },
      ];

      const mockCoverage = [
        {
          cameraId: "cam-vault-01",
          segments: [
            {
              segmentId: "seg-1",
              cameraId: "cam-vault-01",
              startTime: new Date("2026-08-17T14:00:00Z"),
              endTime: new Date("2026-08-17T14:30:00Z"),
              durationMs: 1800000,
              fileSize: 10000000,
              storage: { tier: "HOT" as const, uri: "recording://storage-1/s1.mkv", available: true },
              archive: { state: "ONLINE" as const, restoreRequired: false },
              health: "HEALTHY" as const,
            },
          ],
          gaps: [],
          coverageMs: 1800000,
          requestedMs: 3600000,
          coveragePercent: 50,
        },
      ];

      const buckets = aggregationService.aggregate(from, to, 60, mockEvents, mockCoverage);

      expect(buckets.length).toBe(60);

      // Bucket 0 (14:00 - 14:01)
      expect(buckets[0].recorded).toBe(true);
      expect(buckets[0].motionCount).toBe(1);
      expect(buckets[0].personCount).toBe(1);
      expect(buckets[0].totalEvents).toBe(2);

      // Bucket 5 (14:05 - 14:06)
      expect(buckets[5].recorded).toBe(true);
      expect(buckets[5].doorCount).toBe(1);
      expect(buckets[5].alertCount).toBe(1);
      expect(buckets[5].totalEvents).toBe(2);

      // Bucket 40 (14:40 - 14:41) - not covered by video
      expect(buckets[40].recorded).toBe(false);
      expect(buckets[40].totalEvents).toBe(0);
    });
  });

  describe("2. Multi-Modal Investigation Search with Spatial Zone Expansion", () => {
    it("correlates branch, camera, person detection, door sensor, and P1 alerts", async () => {
      const mockEvents: DbInvestigationEvent[] = [
        {
          id: "ev-person",
          tenantId: "tenant-kollam",
          branchId: "branch-kollam",
          cameraId: "cam-kollam-vault",
          eventType: "person.detected",
          objectType: "PERSON",
          severity: "MEDIUM",
          startTime: "2026-08-17T14:15:00.000Z",
          metadata: { zone: "Vault" },
          createdAt: "2026-08-17T14:15:00.000Z",
        },
        {
          id: "ev-door",
          tenantId: "tenant-kollam",
          branchId: "branch-kollam",
          deviceId: "door-kollam-vault",
          zoneId: "Vault",
          eventType: "door.opened",
          severity: "HIGH",
          startTime: "2026-08-17T14:15:10.000Z",
          metadata: { zone: "Vault" },
          createdAt: "2026-08-17T14:15:10.000Z",
        },
      ];

      const mockPool = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("SELECT c.id as camera_id")) {
            return {
              rows: [{
                camera_id: "cam-kollam-vault",
                branch_id: "branch-kollam",
                device_inventory_id: "door-kollam-vault",
                zone_name: "Vault",
              }],
            };
          }
          if (sql.includes("FROM investigation_events")) {
            return { rows: mockEvents };
          }
          return { rows: [] };
        }),
      } as any;

      const mockRecordingIndex = {
        findRecording: vi.fn().mockResolvedValue({
          from: new Date("2026-08-17T14:00:00Z"),
          to: new Date("2026-08-17T17:00:00Z"),
          cameras: [
            {
              cameraId: "cam-kollam-vault",
              segments: [
                {
                  segmentId: "seg-1",
                  cameraId: "cam-kollam-vault",
                  startTime: new Date("2026-08-17T14:00:00Z"),
                  endTime: new Date("2026-08-17T17:00:00Z"),
                  durationMs: 10800000,
                  fileSize: 50000000,
                  storage: { tier: "HOT", uri: "recording://storage-01/seg-1.mkv", available: true },
                  archive: { state: "ONLINE", restoreRequired: false },
                  health: "HEALTHY",
                },
              ],
              gaps: [],
              coverageMs: 10800000,
              requestedMs: 10800000,
              coveragePercent: 100,
            },
          ],
        }),
      } as any;

      const searchService = new InvestigationSearchService(mockPool, {
        recordingIndex: mockRecordingIndex,
      });

      const result = await searchService.search({
        tenantId: "tenant-kollam",
        cameraIds: ["cam-kollam-vault"],
        zones: ["Vault"],
        from: new Date("2026-08-17T14:00:00Z"),
        to: new Date("2026-08-17T17:00:00Z"),
        includeRelatedAssets: true,
        resolutionSeconds: 300, // 5-minute buckets
      });

      expect(result.videoCoverage.length).toBe(1);
      expect(result.videoCoverage[0].coveragePercent).toBe(100);
      expect(result.events.length).toBe(2);
      expect(result.eventSummary["person.detected"]).toBe(1);
      expect(result.eventSummary["door.opened"]).toBe(1);
      expect(result.eventSummary["object.person"]).toBe(1);
      expect(result.timelineBuckets).toBeDefined();
      expect(result.timelineBuckets?.length).toBe(36); // (3 hours * 60) / 5 = 36 buckets
    });
  });

  describe("3. Fastify REST Endpoints Integration", () => {
    it("serves /api/v1/recordings/search and /api/v1/investigations/search", async () => {
      const mockSearchService = {
        search: vi.fn().mockResolvedValue({
          from: new Date("2026-08-17T14:00:00Z"),
          to: new Date("2026-08-17T15:00:00Z"),
          videoCoverage: [],
          events: [],
          eventSummary: {},
          timelineBuckets: [
            {
              start: "2026-08-17T14:00:00.000Z",
              end: "2026-08-17T14:01:00.000Z",
              recorded: true,
              motionCount: 0,
              personCount: 0,
              vehicleCount: 0,
              doorCount: 0,
              alertCount: 0,
              incidentCount: 0,
              bookmarkCount: 0,
              totalEvents: 0,
            },
          ],
        }),
        recordEvent: vi.fn(),
      } as any;

      const mockRecordingService = {
        findRecording: vi.fn().mockResolvedValue({
          from: new Date("2026-08-17T14:00:00Z"),
          to: new Date("2026-08-17T15:00:00Z"),
          cameras: [],
        }),
      } as any;

      const app = Fastify();
      await registerRecordingIndexRoutes(app, mockRecordingService);
      await registerInvestigationRoutes(app, mockSearchService);
      await app.ready();

      // Test GET /api/v1/investigations/timeline
      const timelineResp = await app.inject({
        method: "GET",
        url: "/api/v1/investigations/timeline?from=2026-08-17T14:00:00Z&to=2026-08-17T15:00:00Z&resolution=60",
      });

      expect(timelineResp.statusCode).toBe(200);
      const data = JSON.parse(timelineResp.body).data;
      expect(data.resolutionSeconds).toBe(60);
      expect(Array.isArray(data.buckets)).toBe(true);
      expect(data.buckets.length).toBe(1);
    });
  });
});
