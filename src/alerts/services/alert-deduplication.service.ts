import { createHash } from "node:crypto";
import type { OperationalAlert } from "../domain/operational-alert.types.js";
import type { NormalizedAlertCandidate } from "./alert-normalizer.service.js";

export interface DedupIdentity {
  tenantId: string;
  sourceType: "camera" | "recorder" | "disk" | "network" | "analytics";
  sourceId: string;
  detectorId?: string | undefined;
  alertType: string;
  objectTrackId?: string | undefined;
  qualifier?: string | undefined;
}

export interface DeduplicationPolicy {
  ttlSeconds: number;
  slidingWindow: boolean;
}

export interface DeduplicationResult {
  duplicate: boolean;
  canonicalAlertId: string;
  occurrenceCount: number;
  dedupKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  degraded?: boolean | undefined;
  reason?: string | undefined;
}

export interface DeduplicationWindow {
  alertId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
}

export const DEFAULT_DEDUP_POLICIES: Record<string, DeduplicationPolicy> = {
  person_detected: { ttlSeconds: 30, slidingWindow: true },
  intrusion: { ttlSeconds: 60, slidingWindow: true },
  person_in_vault: { ttlSeconds: 60, slidingWindow: true },
  motion: { ttlSeconds: 20, slidingWindow: true },
  face_watchlist_match: { ttlSeconds: 20, slidingWindow: true },
  fire_detected: { ttlSeconds: 60, slidingWindow: true },
  smoke_detected: { ttlSeconds: 60, slidingWindow: true },
  camera_offline: { ttlSeconds: 300, slidingWindow: false },
  recorder_offline: { ttlSeconds: 300, slidingWindow: false },
  wan_offline: { ttlSeconds: 300, slidingWindow: false },
  smart_warning: { ttlSeconds: 1800, slidingWindow: false },
  hdd_failure: { ttlSeconds: 1800, slidingWindow: false },
  retention_violation: { ttlSeconds: 86400, slidingWindow: false },
};

export interface RedisClientInterface {
  isOpen?: boolean;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<any>;
  hGetAll?(key: string): Promise<Record<string, string>>;
  del?(key: string): Promise<number>;
  ping?(): Promise<string>;
}

export class AlertDeduplicationService {
  private readonly memoryStore = new Map<string, {
    alertId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    occurrenceCount: number;
    expiresAt: number;
    slidingWindow: boolean;
    ttlSeconds: number;
  }>();

  private metrics = {
    requestsTotal: 0,
    newTotal: 0,
    duplicateTotal: 0,
    errorsTotal: 0,
  };

  constructor(private readonly redisClient?: RedisClientInterface) {}

  /**
   * Build deterministic, tenant-isolated SHA-256 hash deduplication key.
   */
  public buildKey(identity: DedupIdentity): string {
    const canonical = JSON.stringify({
      tenantId: identity.tenantId.trim().toLowerCase(),
      sourceType: identity.sourceType.trim().toLowerCase(),
      sourceId: identity.sourceId.trim().toLowerCase(),
      detectorId: identity.detectorId ? identity.detectorId.trim().toLowerCase() : null,
      alertType: identity.alertType.trim().toLowerCase(),
      objectTrackId: identity.objectTrackId ? identity.objectTrackId.trim().toLowerCase() : null,
      qualifier: identity.qualifier ? identity.qualifier.trim().toLowerCase() : null,
    });

    const hash = createHash("sha256").update(canonical).digest("hex");
    return `dedup:v1:${hash}`;
  }

  /**
   * Resolve deduplication policy for alert type
   */
  public resolvePolicy(alertType: string): DeduplicationPolicy {
    const typeLower = alertType.toLowerCase();
    for (const [key, policy] of Object.entries(DEFAULT_DEDUP_POLICIES)) {
      if (typeLower.includes(key)) {
        return policy;
      }
    }
    return { ttlSeconds: 60, slidingWindow: true };
  }

  /**
   * Atomically check and register an alert window in distributed Redis (or in-memory store).
   */
  async checkAndRegister(
    identity: DedupIdentity,
    candidateAlertId: string,
    customPolicy?: DeduplicationPolicy,
  ): Promise<DeduplicationResult> {
    this.metrics.requestsTotal += 1;
    const key = this.buildKey(identity);
    const policy = customPolicy ?? this.resolvePolicy(identity.alertType);
    const now = new Date().toISOString();

    // If Redis is configured, execute atomic Lua script
    if (this.redisClient && this.redisClient.isOpen !== false) {
      try {
        const luaScript = `
          local key = KEYS[1]
          local alertId = ARGV[1]
          local timestamp = ARGV[2]
          local ttl = tonumber(ARGV[3])
          local sliding = ARGV[4]

          if redis.call('EXISTS', key) == 0 then
              redis.call('HSET', key, 'alertId', alertId, 'firstSeen', timestamp, 'lastSeen', timestamp, 'count', 1)
              redis.call('EXPIRE', key, ttl)
              return {0, alertId, 1, timestamp, timestamp}
          else
              local existingAlertId = redis.call('HGET', key, 'alertId')
              local count = redis.call('HINCRBY', key, 'count', 1)
              redis.call('HSET', key, 'lastSeen', timestamp)
              local firstSeen = redis.call('HGET', key, 'firstSeen')
              if sliding == '1' then
                  redis.call('EXPIRE', key, ttl)
              end
              return {1, existingAlertId or alertId, count, firstSeen or timestamp, timestamp}
          end
        `;

        const result = await this.redisClient.eval(luaScript, {
          keys: [key],
          arguments: [
            candidateAlertId,
            now,
            String(policy.ttlSeconds),
            policy.slidingWindow ? "1" : "0",
          ],
        });

        const isDuplicate = result[0] === 1 || result[0] === "1";
        const canonicalAlertId = String(result[1]);
        const occurrenceCount = Number(result[2]) || 1;
        const firstSeenAt = String(result[3] || now);
        const lastSeenAt = String(result[4] || now);

        if (isDuplicate) {
          this.metrics.duplicateTotal += 1;
        } else {
          this.metrics.newTotal += 1;
        }

        return {
          duplicate: isDuplicate,
          canonicalAlertId,
          occurrenceCount,
          dedupKey: key,
          firstSeenAt,
          lastSeenAt,
        };
      } catch (err: any) {
        this.metrics.errorsTotal += 1;
        // Fail-open resilience: Never suppress security alerts when Redis fails
        this.metrics.newTotal += 1;
        return {
          duplicate: false,
          canonicalAlertId: candidateAlertId,
          occurrenceCount: 1,
          dedupKey: key,
          firstSeenAt: now,
          lastSeenAt: now,
          degraded: true,
          reason: `REDIS_ERROR: ${err.message}`,
        };
      }
    }

    // In-memory atomic fallback
    return this.executeInMemoryCheckAndRegister(key, candidateAlertId, policy, now);
  }

  private executeInMemoryCheckAndRegister(
    key: string,
    candidateAlertId: string,
    policy: DeduplicationPolicy,
    now: string,
  ): DeduplicationResult {
    const nowMs = Date.now();
    const existing = this.memoryStore.get(key);

    if (existing && existing.expiresAt > nowMs) {
      existing.occurrenceCount += 1;
      existing.lastSeenAt = now;
      if (policy.slidingWindow) {
        existing.expiresAt = nowMs + policy.ttlSeconds * 1000;
      }
      this.metrics.duplicateTotal += 1;
      return {
        duplicate: true,
        canonicalAlertId: existing.alertId,
        occurrenceCount: existing.occurrenceCount,
        dedupKey: key,
        firstSeenAt: existing.firstSeenAt,
        lastSeenAt: existing.lastSeenAt,
      };
    }

    // Create new window
    this.memoryStore.set(key, {
      alertId: candidateAlertId,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      expiresAt: nowMs + policy.ttlSeconds * 1000,
      slidingWindow: policy.slidingWindow,
      ttlSeconds: policy.ttlSeconds,
    });

    this.metrics.newTotal += 1;
    return {
      duplicate: false,
      canonicalAlertId: candidateAlertId,
      occurrenceCount: 1,
      dedupKey: key,
      firstSeenAt: now,
      lastSeenAt: now,
    };
  }

  /**
   * Compatibility method for OperationalAlert ingestion in AlertOperationsService
   */
  async checkDuplicate(
    candidate: NormalizedAlertCandidate,
    activeAlerts: Map<string, OperationalAlert>,
    candidateAlertId?: string,
  ): Promise<{ isDuplicate: boolean; existingAlert?: OperationalAlert | undefined; dedupResult?: DeduplicationResult }> {
    const rawDetection = candidate.detection as any;
    const identity: DedupIdentity = {
      tenantId: candidate.tenantId,
      sourceType: candidate.camera?.id ? "camera" : "analytics",
      sourceId: candidate.camera?.id || candidate.branch.id,
      detectorId: rawDetection?.detectorId ?? undefined,
      alertType: candidate.detection.type,
      objectTrackId: rawDetection?.trackId ?? undefined,
    };

    const tempId = candidateAlertId ?? `alert-candidate-${Date.now()}`;
    const result = await this.checkAndRegister(identity, tempId);

    if (result.duplicate) {
      const existing = activeAlerts.get(result.canonicalAlertId);
      if (existing && existing.status !== "RESOLVED" && existing.status !== "DISMISSED") {
        return {
          isDuplicate: true,
          existingAlert: existing,
          dedupResult: result,
        };
      }
    }

    return {
      isDuplicate: false,
      dedupResult: result,
    };
  }

  /**
   * Register alert window (Compatibility method)
   */
  async registerWindow(alert: OperationalAlert): Promise<DeduplicationResult> {
    const rawDetection = alert.detection as any;
    const identity: DedupIdentity = {
      tenantId: alert.tenantId,
      sourceType: alert.camera?.id ? "camera" : "analytics",
      sourceId: alert.camera?.id || alert.branch.id,
      detectorId: rawDetection?.detectorId ?? undefined,
      alertType: alert.detection.type,
      objectTrackId: rawDetection?.trackId ?? undefined,
    };

    return this.checkAndRegister(identity, alert.id);
  }

  /**
   * Clear deduplication window manually
   */
  async clearWindow(identityOrKey: DedupIdentity | string): Promise<void> {
    const key = typeof identityOrKey === "string" ? identityOrKey : this.buildKey(identityOrKey);
    this.memoryStore.delete(key);
    if (this.redisClient?.del) {
      try {
        await this.redisClient.del(key);
      } catch {
        // Ignore redis cleanup error
      }
    }
  }

  /**
   * Observability metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      activeWindows: this.memoryStore.size,
      redisConnected: Boolean(this.redisClient && this.redisClient.isOpen !== false),
    };
  }
}

export const alertDeduplicationService = new AlertDeduplicationService();
