import { randomUUID } from "node:crypto";
import { RecordingIndexService } from "./recording-index.service.js";

export type PlaybackState = "loading" | "playing" | "paused" | "seeking" | "ended";

export interface PlaybackSession {
  id: string;
  userId: string;
  cameraIds: string[];
  cursor: string; // ISO timestamp
  speed: number; // 0.5, 1, 2, 4, 8, 16
  state: PlaybackState;
  streamTransport: "WEBRTC" | "HLS_LL";
  sessionUrl: string;
  resolvedSegmentsCount: number;
  expiresAt: string;
  createdAt: string;
}

export class PlaybackPipelineService {
  private sessions = new Map<string, PlaybackSession>();

  constructor(private recordingIndex: RecordingIndexService) {}

  /**
   * Create an authoritative playback session.
   * Resolves segments from RecordingIndex - never connects to live camera or scans raw filesystem.
   */
  async createPlaybackSession(input: {
    userId: string;
    cameraIds: string[];
    startTime: string;
    endTime: string;
  }): Promise<PlaybackSession> {
    const timeline = await this.recordingIndex.queryTimeline({
      cameraIds: input.cameraIds,
      from: input.startTime,
      to: input.endTime,
    });

    let totalSegs = 0;
    for (const t of timeline.timeline) {
      totalSegs += t.segments.length;
    }

    const sessionId = `pb-sess-${randomUUID().slice(0, 8)}`;
    const now = new Date();

    const session: PlaybackSession = {
      id: sessionId,
      userId: input.userId,
      cameraIds: input.cameraIds,
      cursor: input.startTime,
      speed: 1.0,
      state: "playing",
      streamTransport: "WEBRTC",
      sessionUrl: `/api/control/v1/media/pipeline/playback-stream/${sessionId}`,
      resolvedSegmentsCount: totalSegs,
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async controlPlayback(
    sessionId: string,
    action: "PLAY" | "PAUSE" | "SEEK" | "SET_SPEED" | "STEP_FRAME",
    payload?: { cursor?: string; speed?: number },
  ): Promise<PlaybackSession> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error("playback_session_not_found");

    if (action === "PLAY") {
      session.state = "playing";
    } else if (action === "PAUSE") {
      session.state = "paused";
    } else if (action === "SEEK" && payload?.cursor) {
      session.cursor = payload.cursor;
      session.state = "seeking";
    } else if (action === "SET_SPEED" && payload?.speed) {
      session.speed = payload.speed;
    } else if (action === "STEP_FRAME") {
      session.state = "paused";
      const cur = new Date(session.cursor).getTime();
      session.cursor = new Date(cur + 40).toISOString(); // 25fps = 40ms step
    }

    return session;
  }

  getSession(sessionId: string): PlaybackSession | undefined {
    return this.sessions.get(sessionId);
  }
}
