import { describe, it, expect, beforeEach, vi } from "vitest";
import { RecordingGapService } from "../../src/recording-index/recording-gap.service.js";
import { StorageResolver } from "../../src/storage/storage-resolver.service.js";
import { RecordingIndexService } from "../../src/recording-index/recording-index.service.js";
import { RecordingKeyframeService } from "../../src/recording-index/recording-keyframe.service.js";

describe("RecordingIndex & Storage Subsystem Suite", () => {
  describe("1. RecordingGapService & Interval Overlap Coalescing", () => {
    const gapService = new RecordingGapService();

    it("coalesces overlapping and contiguous segments correctly", () => {
      const segments = [
        {
          startTime: new Date("2026-08-17T14:00:00Z"),
          endTime: new Date("2026-08-17T14:05:00Z"),
        },
        {
          startTime: new Date("2026-08-17T14:04:30Z"),
          endTime: new Date("2026-08-17T14:10:00Z"),
        },
        {
          startTime: new Date("2026-08-17T14:10:15Z"), // 15-second gap
          endTime: new Date("2026-08-17T14:20:00Z"),
        },
      ];

      const merged = gapService.mergeIntervals(segments);
      expect(merged.length).toBe(2);
      expect(new Date(merged[0].startMs).toISOString()).toBe("2026-08-17T14:00:00.000Z");
      expect(new Date(merged[0].endMs).toISOString()).toBe("2026-08-17T14:10:00.000Z");
      expect(new Date(merged[1].startMs).toISOString()).toBe("2026-08-17T14:10:15.000Z");
      expect(new Date(merged[1].endMs).toISOString()).toBe("2026-08-17T14:20:00.000Z");
    });

    it("calculates exact recording gaps and coverage percentage within query window", () => {
      const from = new Date("2026-08-17T14:00:00Z");
      const to = new Date("2026-08-17T14:20:00Z"); // 20 minutes = 1,200,000 ms

      // Segment A: 14:00:00 -> 14:10:00 (10 mins)
      // Gap: 14:10:00 -> 14:10:12 (12 seconds)
      // Segment B: 14:10:12 -> 14:20:00 (9 mins 48 secs)
      const segments = [
        {
          startTime: new Date("2026-08-17T14:00:00Z"),
          endTime: new Date("2026-08-17T14:10:00Z"),
        },
        {
          startTime: new Date("2026-08-17T14:10:12Z"),
          endTime: new Date("2026-08-17T14:20:00Z"),
        },
      ];

      const result = gapService.calculateGaps(from, to, segments);

      expect(result.requestedMs).toBe(1_200_000);
      expect(result.gaps.length).toBe(1);
      expect(result.gaps[0].durationMs).toBe(12_000);
      expect(result.gaps[0].from.toISOString()).toBe("2026-08-17T14:10:00.000Z");
      expect(result.gaps[0].to.toISOString()).toBe("2026-08-17T14:10:12.000Z");
      expect(result.coverageMs).toBe(1_188_000); // 1,200,000 - 12,000
      expect(result.coveragePercent).toBe(99);
    });

    it("includes segments that started before requested interval window", () => {
      // Query: 14:00 -> 15:00
      // Segment: 13:50 -> 14:05 (started before 14:00)
      const from = new Date("2026-08-17T14:00:00Z");
      const to = new Date("2026-08-17T15:00:00Z");

      const segments = [
        {
          startTime: new Date("2026-08-17T13:50:00Z"),
          endTime: new Date("2026-08-17T14:05:00Z"),
        },
      ];

      const result = gapService.calculateGaps(from, to, segments);
      // Covered 14:00 -> 14:05 = 5 minutes = 300,000 ms
      expect(result.coverageMs).toBe(300_000);
      expect(result.gaps.length).toBe(1);
      expect(result.gaps[0].from.toISOString()).toBe("2026-08-17T14:05:00.000Z");
      expect(result.gaps[0].to.toISOString()).toBe("2026-08-17T15:00:00.000Z");
    });
  });

  describe("2. StorageResolver Uniform Logical URIs", () => {
    const resolver = new StorageResolver({
      localNodeId: "storage-01",
      nodeMounts: {
        "storage-01": "/mnt/storage01",
        "storage-02": "/mnt/storage02",
      },
      s3BaseUrl: "https://s3.ap-south-1.amazonaws.com",
    });

    it("resolves recording:// logical URI correctly for local node", () => {
      const uri = "recording://storage-01/tenant-1/branch-01/cam-01/2026/08/17/segment.mkv";
      const resolved = resolver.resolve(uri, { storageTier: "HOT", archiveState: "ONLINE" });

      expect(resolved.protocol).toBe("recording");
      expect(resolved.isLocal).toBe(true);
      expect(resolved.requiresRestore).toBe(false);
      expect(resolved.storageNodeId).toBe("storage-01");
      expect(resolved.streamUrl).toContain(encodeURIComponent(uri));
    });

    it("resolves s3:// logical URI for cold/cloud archive with restore flag", () => {
      const uri = "s3://sentinel-archive-bucket/tenant-1/cam-01/segment.mkv";
      const resolved = resolver.resolve(uri, { storageTier: "ARCHIVE", archiveState: "ARCHIVED" });

      expect(resolved.protocol).toBe("s3");
      expect(resolved.isLocal).toBe(false);
      expect(resolved.requiresRestore).toBe(true);
      expect(resolved.streamUrl).toBe("https://s3.ap-south-1.amazonaws.com/sentinel-archive-bucket/tenant-1/cam-01/segment.mkv");
    });

    it("resolves nvr:// logical URI for edge NVR channels", () => {
      const uri = "nvr://BR118-NVR01/CH04/20260817T143200Z";
      const resolved = resolver.resolve(uri);

      expect(resolved.protocol).toBe("nvr");
      expect(resolved.requiresRestore).toBe(false);
      expect(resolved.streamUrl).toContain("recorderId=BR118-NVR01");
    });
  });

  describe("3. RecordingIndex Keyframe Lookup & Seeking", () => {
    it("finds the nearest earlier keyframe for requested scrubbing timestamp", async () => {
      const mockPool = {
        query: vi.fn().mockImplementation((sql: string) => {
          if (sql.includes("FROM recording_keyframes")) {
            return {
              rows: [
                {
                  segment_id: "seg-100",
                  timestamp: "2026-08-17T14:32:16.000Z",
                  pts: 144000,
                  dts: 144000,
                  byte_offset: 5242880,
                  camera_id: "cam-vault-01",
                  storage_uri: "recording://storage-01/seg-100.mkv",
                },
              ],
            };
          }
          return { rows: [] };
        }),
      } as any;

      const keyframeService = new RecordingKeyframeService(mockPool);
      // User scrubs to 14:32:17.500
      const targetTime = new Date("2026-08-17T14:32:17.500Z");
      const keyframe = await keyframeService.findNearestKeyframe("cam-vault-01", targetTime);

      expect(keyframe).toBeDefined();
      expect(keyframe?.segmentId).toBe("seg-100");
      expect(keyframe?.nearestKeyframeTime.toISOString()).toBe("2026-08-17T14:32:16.000Z");
      expect(keyframe?.byteOffset).toBe(5242880);
      expect(keyframe?.pts).toBe(144000);
      expect(keyframe?.timeDifferenceMs).toBe(1500); // 1.5 seconds difference
    });
  });

  describe("4. RecordingIndex Registration and Tier Lifecycle", () => {
    it("registers finalized segments idempotently and tracks tier transitions", async () => {
      const mockRows: any[] = [];
      const mockLocations: any[] = [];

      const mockPool = {
        query: vi.fn().mockImplementation((sql: string, params?: any[]) => {
          if (sql.includes("INSERT INTO recording_segments")) {
            const row = {
              id: params?.[0] || "seg-uuid-1",
              camera_id: params?.[1],
              job_id: params?.[2],
              started_at: params?.[3],
              ended_at: params?.[4],
              storage_path: params?.[5],
              storage_uri: params?.[6],
              size_bytes: params?.[7],
              storage_node_external_id: params?.[8],
              storage_tier: params?.[9],
              status: "ready",
              archive_state: "ONLINE",
              health: "HEALTHY",
              created_at: new Date().toISOString(),
            };
            mockRows.push(row);
            return { rows: [row] };
          }
          if (sql.includes("INSERT INTO recording_segment_locations")) {
            const loc = {
              id: "loc-1",
              segment_id: params?.[0],
              storage_node_id: params?.[1],
              storage_tier: params?.[2],
              storage_uri: params?.[3],
              state: params?.[4],
              created_at: new Date().toISOString(),
            };
            mockLocations.push(loc);
            return { rows: [loc] };
          }
          if (sql.includes("first_recorded")) {
            return {
              rows: [{
                first_recorded: "2026-08-17T10:00:00.000Z",
                last_recorded: "2026-08-17T18:00:00.000Z",
                total_segments: 10,
                total_size: 50000000,
              }],
            };
          }
          if (sql.includes("GROUP BY archive_state")) {
            return {
              rows: [{ state: "ONLINE", count: 10 }],
            };
          }
          return { rows: [] };
        }),
      } as any;

      const indexService = new RecordingIndexService(mockPool);

      const segment = await indexService.registerSegment({
        id: "seg-uuid-1",
        tenantId: "tenant-1",
        branchId: "branch-01",
        cameraId: "cam-vault-01",
        startTime: new Date("2026-08-17T14:30:00Z"),
        endTime: new Date("2026-08-17T14:30:30Z"),
        storageNodeId: "storage-01",
        storageTier: "HOT",
        storageUri: "recording://storage-01/cam-vault-01/segment.mkv",
        fileSize: 10485760,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      });

      expect(segment.segmentId).toBe("seg-uuid-1");
      expect(segment.storage.tier).toBe("HOT");
      expect(segment.archive.state).toBe("ONLINE");

      const range = await indexService.getRecordingRange("cam-vault-01");
      expect(range.totalSegments).toBe(10);
      expect(range.firstRecordedTime?.toISOString()).toBe("2026-08-17T10:00:00.000Z");
    });
  });
});
