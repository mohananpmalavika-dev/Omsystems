/**
 * Media Session Service
 * Manages live video session lifecycle, leases, and heartbeats
 */

import { randomUUID } from "crypto";
import { logger } from "../utils/logger.js";
import type {
  MediaSession,
  CreateMediaSessionRequest,
  MediaSessionHeartbeat,
  MediaSessionState,
  VideoProfile,
  CameraStreamCapabilities,
} from "./types.js";

export interface MediaSessionServiceOptions {
  defaultSessionTTLSeconds?: number;
  heartbeatIntervalSeconds?: number;
  heartbeatGracePeriodSeconds?: number;
}

export class MediaSessionService {
  private sessions: Map<string, MediaSession> = new Map();
  private userSessions: Map<string, Set<string>> = new Map(); // userId -> sessionIds
  private cameraSessions: Map<string, Set<string>> = new Map(); // cameraId -> sessionIds
  private readonly defaultTTL: number;
  private readonly heartbeatInterval: number;
  private readonly heartbeatGracePeriod: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: MediaSessionServiceOptions = {}) {
    this.defaultTTL = options.defaultSessionTTLSeconds || 300; // 5 minutes
    this.heartbeatInterval = options.heartbeatIntervalSeconds || 30; // 30 seconds
    this.heartbeatGracePeriod = options.heartbeatGracePeriodSeconds || 60; // 1 minute

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Create a new media session
   */
  async createSession(
    request: CreateMediaSessionRequest,
    profile: VideoProfile,
    gatewayId?: string
  ): Promise<MediaSession> {
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.defaultTTL * 1000);

    // Determine transport type based on profile
    // In production, this would negotiate with media gateway
    const transportType = "WEBRTC"; // Prefer WebRTC for live monitoring

    const session: MediaSession = {
      id: sessionId,
      cameraId: request.cameraId,
      userId: request.userId,
      tenantId: request.tenantId,
      gatewayId,
      profile,
      purpose: request.purpose,
      priority: request.priority || 0,
      createdAt: now,
      lastHeartbeatAt: now,
      expiresAt,
      state: "REQUESTED",
      transportType,
    };

    this.sessions.set(sessionId, session);

    // Index by user
    if (!this.userSessions.has(request.userId)) {
      this.userSessions.set(request.userId, new Set());
    }
    this.userSessions.get(request.userId)!.add(sessionId);

    // Index by camera
    if (!this.cameraSessions.has(request.cameraId)) {
      this.cameraSessions.set(request.cameraId, new Set());
    }
    this.cameraSessions.get(request.cameraId)!.add(sessionId);

    logger.info("Media session created", {
      sessionId,
      cameraId: request.cameraId,
      userId: request.userId,
      purpose: request.purpose,
      profile: `${profile.width}x${profile.height}@${profile.fps}fps`,
    });

    return session;
  }

  /**
   * Update session state
   */
  updateSessionState(
    sessionId: string,
    state: MediaSessionState,
    connectionUrl?: string
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn("Session not found for state update", { sessionId });
      return false;
    }

    session.state = state;
    if (connectionUrl) {
      session.connectionUrl = connectionUrl;
    }

    logger.debug("Session state updated", {
      sessionId,
      cameraId: session.cameraId,
      state,
    });

    return true;
  }

  /**
   * Process heartbeat
   */
  processHeartbeat(heartbeat: MediaSessionHeartbeat): boolean {
    const session = this.sessions.get(heartbeat.sessionId);
    if (!session) {
      logger.debug("Session not found for heartbeat", {
        sessionId: heartbeat.sessionId,
      });
      return false;
    }

    session.lastHeartbeatAt = heartbeat.timestamp;

    // Extend session expiry
    const newExpiry = new Date(
      heartbeat.timestamp.getTime() + this.defaultTTL * 1000
    );
    session.expiresAt = newExpiry;

    // Update state if active
    if (heartbeat.active && session.state === "CONNECTING") {
      session.state = "ACTIVE";
    }

    logger.debug("Heartbeat processed", {
      sessionId: heartbeat.sessionId,
      cameraId: session.cameraId,
      expiresAt: newExpiry,
    });

    return true;
  }

  /**
   * Close session
   */
  closeSession(sessionId: string, reason?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.state = "CLOSED";

    // Remove from indexes
    this.removeFromIndexes(sessionId, session);

    // Delete session
    this.sessions.delete(sessionId);

    logger.info("Session closed", {
      sessionId,
      cameraId: session.cameraId,
      userId: session.userId,
      reason,
      duration: Date.now() - session.createdAt.getTime(),
    });

    return true;
  }

  /**
   * Close all sessions for a camera
   */
  closeSessionsForCamera(cameraId: string, reason?: string): number {
    const sessionIds = this.cameraSessions.get(cameraId);
    if (!sessionIds) {
      return 0;
    }

    let count = 0;
    for (const sessionId of Array.from(sessionIds)) {
      if (this.closeSession(sessionId, reason)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Close all sessions for a user
   */
  closeSessionsForUser(userId: string, reason?: string): number {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return 0;
    }

    let count = 0;
    for (const sessionId of Array.from(sessionIds)) {
      if (this.closeSession(sessionId, reason)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): MediaSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get sessions for user
   */
  getSessionsForUser(userId: string): MediaSession[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is MediaSession => s !== undefined);
  }

  /**
   * Get sessions for camera
   */
  getSessionsForCamera(cameraId: string): MediaSession[] {
    const sessionIds = this.cameraSessions.get(cameraId);
    if (!sessionIds) {
      return [];
    }

    return Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is MediaSession => s !== undefined);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): MediaSession[] {
    return Array.from(this.sessions.values()).filter(
      (s) => s.state === "ACTIVE" || s.state === "CONNECTING"
    );
  }

  /**
   * Cleanup expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let expiredCount = 0;
    let staleCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // Check explicit expiry
      if (session.expiresAt < now) {
        this.closeSession(sessionId, "Session expired");
        expiredCount++;
        continue;
      }

      // Check heartbeat staleness
      const timeSinceHeartbeat = now.getTime() - session.lastHeartbeatAt.getTime();
      const heartbeatThreshold =
        (this.heartbeatInterval + this.heartbeatGracePeriod) * 1000;

      if (timeSinceHeartbeat > heartbeatThreshold) {
        this.closeSession(sessionId, "Heartbeat timeout");
        staleCount++;
      }
    }

    if (expiredCount > 0 || staleCount > 0) {
      logger.info("Session cleanup complete", {
        expired: expiredCount,
        stale: staleCount,
        remaining: this.sessions.size,
      });
    }
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    // Run cleanup every minute
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60_000);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Remove session from indexes
   */
  private removeFromIndexes(sessionId: string, session: MediaSession): void {
    // Remove from user index
    const userSessions = this.userSessions.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.userSessions.delete(session.userId);
      }
    }

    // Remove from camera index
    const cameraSessions = this.cameraSessions.get(session.cameraId);
    if (cameraSessions) {
      cameraSessions.delete(sessionId);
      if (cameraSessions.size === 0) {
        this.cameraSessions.delete(session.cameraId);
      }
    }
  }

  /**
   * Get session metrics
   */
  getMetrics(): {
    totalSessions: number;
    activeSessions: number;
    connectingSessions: number;
    sessionsByPurpose: Record<string, number>;
    sessionsByTransport: Record<string, number>;
    averageSessionDurationSeconds: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const now = Date.now();

    const active = sessions.filter((s) => s.state === "ACTIVE");
    const connecting = sessions.filter((s) => s.state === "CONNECTING");

    const byPurpose: Record<string, number> = {};
    const byTransport: Record<string, number> = {};
    let totalDuration = 0;

    for (const session of sessions) {
      byPurpose[session.purpose] = (byPurpose[session.purpose] || 0) + 1;
      byTransport[session.transportType] =
        (byTransport[session.transportType] || 0) + 1;
      totalDuration += now - session.createdAt.getTime();
    }

    return {
      totalSessions: sessions.length,
      activeSessions: active.length,
      connectingSessions: connecting.length,
      sessionsByPurpose: byPurpose,
      sessionsByTransport: byTransport,
      averageSessionDurationSeconds:
        sessions.length > 0 ? totalDuration / sessions.length / 1000 : 0,
    };
  }

  /**
   * Destroy service (cleanup)
   */
  destroy(): void {
    this.stopCleanupTimer();
    
    // Close all sessions
    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId, "Service shutdown");
    }

    this.sessions.clear();
    this.userSessions.clear();
    this.cameraSessions.clear();

    logger.info("Media session service destroyed");
  }
}
