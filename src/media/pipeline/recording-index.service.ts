import { randomUUID } from "node:crypto";

export interface RecordingSegment {
  id: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  streamProfileId: string;

  startTime: string;
  endTime: string;
  serverStartTime: string;
  durationMs: number;

  codec: "h264" | "h265";
  resolution: string;
  bytes: number;

  storageNodeId: string; // "storage-volume-07"
  storagePath: string; // "/mnt/surveillance/volumes/vol07/BR-118/CAM-27/2026/08/17/seg-1000.mp4"
  sha256: string;

  status: "writing" | "complete" | "corrupt" | "archived";
}

export interface RecordingGap {
  cameraId: string;
  from: string;
  to: string;
  durationSeconds: number;
  reason: "NETWORK_DISCONNECT" | "NODE_FAILOVER" | "POWER_OUTAGE" | "MAINTENANCE";
}

export class RecordingIndexService {
  private segments = new Map<string, RecordingSegment>();
  private gaps: RecordingGap[] = [];

  constructor() {
    this.seedInitialSegments();
  }

  private seedInitialSegments() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600 * 1000);

    // Create continuous 15-minute segments for CAM-27
    for (let i = 0; i < 4; i++) {
      const segStart = new Date(oneHourAgo.getTime() + i * 15 * 60 * 1000);
      const segEnd = new Date(segStart.getTime() + 15 * 60 * 1000);

      const segment: RecordingSegment = {
        id: `seg-cam27-${Date.now()}-${i}`,
        tenantId: "omsystems",
        branchId: "BR-118",
        cameraId: "cam-27",
        streamProfileId: "main",
        startTime: segStart.toISOString(),
        endTime: segEnd.toISOString(),
        serverStartTime: segStart.toISOString(),
        durationMs: 15 * 60 * 1000,
        codec: "h265",
        resolution: "3840x2160",
        bytes: 460800000, // ~440 MB
        storageNodeId: "storage-volume-07",
        storagePath: `/mnt/surveillance/volumes/vol07/BR-118/CAM-27/2026/08/17/seg-${String(i + 1).padStart(4, "0")}.mp4`,
        sha256: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8${i + 5}`,
        status: "complete",
      };

      this.segments.set(segment.id, segment);
    }
  }

  /**
   * Query timeline index for continuous segments and detected gaps.
   * Playback and Evidence services strictly query this index - never scan raw disks.
   */
  async queryTimeline(input: {
    cameraIds: string[];
    from: string;
    to: string;
  }): Promise<{
    timeline: Array<{
      cameraId: string;
      segments: Array<{ id: string; from: string; to: string; durationMs: number; storagePath: string; sha256: string }>;
      gaps: RecordingGap[];
      retentionPolicyDays: number;
    }>;
  }> {
    const fromTime = new Date(input.from).getTime();
    const toTime = new Date(input.to).getTime();

    const result = input.cameraIds.map((cid) => {
      const camSegments = [...this.segments.values()].filter((s) => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = new Date(s.endTime).getTime();
        return s.cameraId === cid && sEnd >= fromTime && sStart <= toTime;
      });

      const camGaps = this.gaps.filter((g) => g.cameraId === cid);

      return {
        cameraId: cid,
        segments: camSegments.map((s) => ({
          id: s.id,
          from: s.startTime,
          to: s.endTime,
          durationMs: s.durationMs,
          storagePath: s.storagePath,
          sha256: s.sha256,
        })),
        gaps: camGaps,
        retentionPolicyDays: 90,
      };
    });

    return { timeline: result };
  }

  async recordCompletedSegment(segment: RecordingSegment): Promise<void> {
    this.segments.set(segment.id, segment);
  }

  getLatestSegmentForCamera(cameraId: string): RecordingSegment | undefined {
    const list = [...this.segments.values()]
      .filter((s) => s.cameraId === cameraId)
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
    return list[0];
  }
}
