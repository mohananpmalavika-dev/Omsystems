/**
 * Playback Session Service
 * 
 * Creates temporary on-demand remote playback sessions against branch NVR local archives
 * without transferring continuous multi-month recordings to Head Office.
 */

import type { PlaybackSession } from "../domain/media-session.types.js";
import { videoAccessAuditService, VideoAccessAuditService } from "./video-access-audit.service.js";

export class PlaybackSessionService {
  private activeSessions: Map<string, PlaybackSession> = new Map();

  constructor(private readonly audit: VideoAccessAuditService = videoAccessAuditService) {}

  async createSession(options: {
    tenantId: string;
    branchId: string;
    cameraId: string;
    from: Date;
    to: Date;
    userId: string;
    sourceIp?: string | undefined;
  }): Promise<PlaybackSession> {
    const id = `pb-sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 900_000); // 15 minutes TTL

    const session: PlaybackSession = {
      id,
      tenantId: options.tenantId,
      branchId: options.branchId,
      cameraId: options.cameraId,
      from: options.from,
      to: options.to,
      requestedByUserId: options.userId,
      state: "READY",
      streamUrl: `wss://edge-gw-178.local/webrtc/playback?session=${id}&cam=${options.cameraId}&from=${options.from.getTime()}&to=${options.to.getTime()}`,
      sessionToken: `token-${id}-${Math.random().toString(36).slice(2, 12)}`,
      createdAt: now,
      expiresAt,
    };

    this.activeSessions.set(id, session);

    // Audit playback access
    await this.audit.logAccess({
      userId: options.userId,
      tenantId: options.tenantId,
      branchId: options.branchId,
      cameraId: options.cameraId,
      action: "PLAYBACK",
      purpose: `Historical playback investigation from ${options.from.toISOString()} to ${options.to.toISOString()}`,
      sourceIp: options.sourceIp,
      startedAt: now,
    });

    return session;
  }

  getSession(id: string): PlaybackSession | undefined {
    return this.activeSessions.get(id);
  }

  clear() {
    this.activeSessions.clear();
  }
}

export const playbackSessionService = new PlaybackSessionService();
