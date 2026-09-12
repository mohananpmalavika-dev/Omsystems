import type { RedisClientType } from "redis";
import type { ViewerSession, ViewerTelemetry } from "../domain/distributed-lease.types.js";
import type { ViewerSessionRepository } from "../domain/viewer-session-repository.contract.js";
import { DistributedStateUnavailableError } from "../../errors/distributed-state.errors.js";

const DEFAULT_SESSION_TTL_SECONDS = 60; // 60s heartbeat window

export class RedisViewerSessionRepository implements ViewerSessionRepository {
  private readonly memorySessions = new Map<string, ViewerSession>();
  private readonly memoryTelemetries = new Map<string, ViewerTelemetry>();

  constructor(
    private readonly redis?: RedisClientType | any,
    private readonly keyPrefix = "media:viewer-session:",
  ) {}

  private isStandaloneOrTest(): boolean {
    return process.env.NODE_ENV === "test" || process.env.MEDIA_STATE_MODE === "standalone";
  }

  private assertDistributedBackendReady(operation: string): void {
    if (!this.redis && !this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError(
        `Distributed state backend (Redis) is required for viewer sessions (${operation}) in production mode`,
      );
    }
  }

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
    this.assertDistributedBackendReady("registerSession");
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
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during registerSession: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test registerSession fallback:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory session registration is prohibited in production mode");
    }

    this.memorySessions.set(session.sessionId, updated);
  }

  async getSession(sessionId: string): Promise<ViewerSession | null> {
    this.assertDistributedBackendReady("getSession");
    if (this.redis) {
      try {
        const key = this.getSessionKey(sessionId);
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as ViewerSession;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during getSession: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test getSession error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory session query is prohibited in production mode");
    }

    return this.memorySessions.get(sessionId) || null;
  }

  async updateTelemetry(
    telemetry: ViewerTelemetry,
    ttlSeconds = DEFAULT_SESSION_TTL_SECONDS,
  ): Promise<void> {
    this.assertDistributedBackendReady("updateTelemetry");
    const payload = JSON.stringify(telemetry);

    if (this.redis) {
      try {
        const key = this.getTelemetryKey(telemetry.sessionId);
        await this.redis.set(key, payload, {
          EX: ttlSeconds,
        });
        return;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during updateTelemetry: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test updateTelemetry fallback:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory telemetry state is prohibited in production mode");
    }

    this.memoryTelemetries.set(telemetry.sessionId, telemetry);
  }

  async getTelemetry(sessionId: string): Promise<ViewerTelemetry | null> {
    this.assertDistributedBackendReady("getTelemetry");
    if (this.redis) {
      try {
        const key = this.getTelemetryKey(sessionId);
        const raw = await this.redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as ViewerTelemetry;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during getTelemetry: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test getTelemetry error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory telemetry query is prohibited in production mode");
    }

    return this.memoryTelemetries.get(sessionId) || null;
  }

  async heartbeat(sessionId: string, ttlSeconds = DEFAULT_SESSION_TTL_SECONDS): Promise<boolean> {
    this.assertDistributedBackendReady("heartbeat");
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
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during heartbeat: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test heartbeat error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory heartbeat is prohibited in production mode");
    }

    const session = this.memorySessions.get(sessionId);
    if (session) {
      session.lastHeartbeatAt = Date.now();
      return true;
    }
    return false;
  }

  async removeSession(sessionId: string): Promise<void> {
    this.assertDistributedBackendReady("removeSession");
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
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during removeSession: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test removeSession error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory session removal is prohibited in production mode");
    }

    this.memorySessions.delete(sessionId);
    this.memoryTelemetries.delete(sessionId);
  }

  async listUserSessions(userId: string): Promise<ViewerSession[]> {
    this.assertDistributedBackendReady("listUserSessions");
    const results: ViewerSession[] = [];

    if (this.redis) {
      try {
        const sessionIds = await this.redis.sMembers(this.getUserIndexKey(userId));
        for (const sid of sessionIds) {
          const session = await this.getSession(sid);
          if (session) {
            results.push(session);
          } else {
            await this.redis.sRem(this.getUserIndexKey(userId), sid);
          }
        }
        return results;
      } catch (err) {
        if (!this.isStandaloneOrTest()) {
          throw new DistributedStateUnavailableError(
            `Redis error during listUserSessions: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        console.warn("[RedisViewerSession] Standalone/test listUserSessions error:", err);
      }
    }

    if (!this.isStandaloneOrTest()) {
      throw new DistributedStateUnavailableError("Local in-memory user sessions list is prohibited in production mode");
    }

    for (const session of this.memorySessions.values()) {
      if (session.userId === userId) {
        results.push(session);
      }
    }
    return results;
  }
}
