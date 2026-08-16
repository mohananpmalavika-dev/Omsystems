import type { RedisClientType } from "redis";
import type { ViewerSession, ViewerTelemetry } from "../domain/distributed-lease.types.js";
import type { ViewerSessionRepository } from "../domain/viewer-session-repository.contract.js";

const DEFAULT_SESSION_TTL_SECONDS = 60; // 60s heartbeat window

export class RedisViewerSessionRepository implements ViewerSessionRepository {
  private readonly memorySessions = new Map<string, ViewerSession>();
  private readonly memoryTelemetries = new Map<string, ViewerTelemetry>();

  constructor(
    private readonly redis?: RedisClientType | any,
    private readonly keyPrefix = "media:viewer-session:",
  ) {}

  private getSessionKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private getTelemetryKey(sessionId: string): string {
    return `media:viewer:${sessionId}:telemetry`;
  }

  private getUserIndexKey(userId: string): string {
    return `media:user-sessions:${userId}`;
  }

  async registerSession(
    session: ViewerSession,
    ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  ): Promise<void> {
    const updated: ViewerSession = {
      ...session,
      lastHeartbeatAt: Date.now(),
    };

    if (this.redis) {
      try {
        const key = this.getSessionKey(session.sessionId);
        await this.redis.set(key, JSON.stringify(updated), {
          EX: ttlSeconds,
        });

        // Add to user active session set
        await this.redis.sAdd(this.getUserIndexKey(session.userId), session.sessionId);
        await this.redis.expire(this.getUserIndexKey(session.userId), ttlSeconds * 2);
        return;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis registerSession error, fallback memory:", err);
      }
    }

    this.memorySessions.set(session.sessionId, updated);
  }

  async getSession(sessionId: string): Promise<ViewerSession | null> {
    if (this.redis) {
      try {
        const key = this.getSessionKey(sessionId);
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as ViewerSession;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis getSession error:", err);
      }
    }

    return this.memorySessions.get(sessionId) || null;
  }

  async updateTelemetry(
    telemetry: ViewerTelemetry,
    ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  ): Promise<void> {
    const payload = JSON.stringify(telemetry);

    if (this.redis) {
      try {
        const key = this.getTelemetryKey(telemetry.sessionId);
        await this.redis.set(key, payload, {
          EX: ttlSeconds,
        });
        return;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis updateTelemetry error:", err);
      }
    }

    this.memoryTelemetries.set(telemetry.sessionId, telemetry);
  }

  async getTelemetry(sessionId: string): Promise<ViewerTelemetry | null> {
    if (this.redis) {
      try {
        const key = this.getTelemetryKey(sessionId);
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as ViewerTelemetry;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis getTelemetry error:", err);
      }
    }

    return this.memoryTelemetries.get(sessionId) || null;
  }

  async heartbeat(sessionId: string, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): Promise<boolean> {
    if (this.redis) {
      try {
        const key = this.getSessionKey(sessionId);
        const telKey = this.getTelemetryKey(sessionId);
        const [sExp, tExp] = await Promise.all([
          this.redis.expire(key, ttlSeconds),
          this.redis.expire(telKey, ttlSeconds),
        ]);
        return sExp || tExp;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis heartbeat error:", err);
      }
    }

    const session = this.memorySessions.get(sessionId);
    if (session) {
      session.lastHeartbeatAt = Date.now();
      return true;
    }
    return false;
  }

  async removeSession(sessionId: string): Promise<void> {
    if (this.redis) {
      try {
        const session = await this.getSession(sessionId);
        if (session) {
          await this.redis.sRem(this.getUserIndexKey(session.userId), sessionId);
        }
        await Promise.all([
          this.redis.del(this.getSessionKey(sessionId)),
          this.redis.del(this.getTelemetryKey(sessionId)),
        ]);
        return;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis removeSession error:", err);
      }
    }

    this.memorySessions.delete(sessionId);
    this.memoryTelemetries.delete(sessionId);
  }

  async listUserSessions(userId: string): Promise<ViewerSession[]> {
    const results: ViewerSession[] = [];

    if (this.redis) {
      try {
        const sessionIds = await this.redis.sMembers(this.getUserIndexKey(userId));
        for (const sid of sessionIds) {
          const session = await this.getSession(sid);
          if (session) {
            results.push(session);
          } else {
            // Clean dead session id from set
            await this.redis.sRem(this.getUserIndexKey(userId), sid);
          }
        }
        return results;
      } catch (err) {
        console.warn("[RedisViewerSession] Redis listUserSessions error:", err);
      }
    }

    for (const session of this.memorySessions.values()) {
      if (session.userId === userId) {
        results.push(session);
      }
    }
    return results;
  }
}
