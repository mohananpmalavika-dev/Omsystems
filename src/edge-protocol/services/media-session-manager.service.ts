import type {
  MediaSession,
  MediaSessionType,
  VideoWallAllocationPlan,
  VideoWallTileTier,
} from "../domain/edge-protocol.types.js";

export class MediaSessionManagerService {
  private readonly sessions = new Map<string, MediaSession>();

  async createMediaSession(params: {
    branchId: string;
    cameraId: string;
    edgeId?: string | undefined;
    streamType?: MediaSessionType | undefined;
    requestedByUserId: string;
    durationMinutes?: number | undefined;
  }): Promise<MediaSession> {
    const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const token = `mtoken_${Buffer.from(`${params.branchId}:${params.cameraId}:${Date.now()}`).toString("base64url")}`;
    const now = new Date();
    const durationMinutes = params.durationMinutes ?? 10;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
    const streamType = params.streamType ?? "WEBRTC";
    const edgeId = params.edgeId ?? `edge-${params.branchId.replace("branch-", "")}`;

    // Tokenized playback URL without leaking raw camera RTSP credentials
    const playbackUrl = `https://media.bank.internal/stream/${sessionId}?token=${token}&type=${streamType.toLowerCase()}`;

    const session: MediaSession = {
      sessionId,
      branchId: params.branchId,
      cameraId: params.cameraId,
      edgeId,
      streamType,
      token,
      playbackUrl,
      status: "ACTIVE",
      requestedByUserId: params.requestedByUserId,
      createdAt: now,
      expiresAt,
      lastKeepAliveAt: now,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  async keepAlive(sessionId: string): Promise<MediaSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "ACTIVE") return null;

    const now = new Date();
    if (now > session.expiresAt) {
      session.status = "EXPIRED";
      return null;
    }

    session.lastKeepAliveAt = now;
    // Extend expiry by 5 minutes on keepalive
    session.expiresAt = new Date(now.getTime() + 5 * 60_000);
    return session;
  }

  async terminateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.status = "TERMINATED";
    return true;
  }

  async listActiveSessions(): Promise<MediaSession[]> {
    const now = new Date();
    const active: MediaSession[] = [];

    for (const s of this.sessions.values()) {
      if (s.status === "ACTIVE") {
        if (now > s.expiresAt) {
          s.status = "EXPIRED";
        } else {
          active.push(s);
        }
      }
    }

    return active;
  }

  /**
   * Plans optimal multi-tier bandwidth distribution for a 144-camera video wall
   * Allocates:
   * - Top 32 prioritized tiles -> Active WebRTC live stream (1500 Kbps)
   * - Next 64 tiles -> 1 FPS low-rate preview (200 Kbps)
   * - Remaining 48 tiles -> Periodic cached snapshot (30 Kbps)
   */
  planVideoWallAllocation(tiles: Array<{ position: number; cameraId: string; branchId: string; priorityScore?: number }>): VideoWallAllocationPlan {
    const totalTiles = tiles.length;

    // Sort tiles by priority (e.g. active alerts, vault cameras)
    const sorted = [...tiles].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

    let activeWebRtcCount = 0;
    let lowFpsPreviewCount = 0;
    let cachedSnapshotCount = 0;
    let totalBandwidthKbps = 0;

    const allocatedTiles: VideoWallAllocationPlan["tiles"] = sorted.map((t, idx) => {
      let tier: VideoWallTileTier;
      let bitrateKbps: number;

      if (idx < 32) {
        tier = "ACTIVE_WEBRTC";
        bitrateKbps = 1500;
        activeWebRtcCount++;
      } else if (idx < 96) {
        tier = "LOW_FPS_PREVIEW";
        bitrateKbps = 200;
        lowFpsPreviewCount++;
      } else {
        tier = "CACHED_SNAPSHOT";
        bitrateKbps = 30;
        cachedSnapshotCount++;
      }

      totalBandwidthKbps += bitrateKbps;

      return {
        position: t.position,
        cameraId: t.cameraId,
        branchId: t.branchId,
        tier,
        allocatedBitrateKbps: bitrateKbps,
      };
    });

    return {
      totalTiles,
      activeWebRtcCount,
      lowFpsPreviewCount,
      cachedSnapshotCount,
      totalBandwidthEstimateKbps: totalBandwidthKbps,
      tiles: allocatedTiles,
    };
  }
}

export const mediaSessionManager = new MediaSessionManagerService();
