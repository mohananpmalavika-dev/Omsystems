/**
 * Redis-based Alert Deduplication Service
 * 
 * Prevents duplicate alert processing across multiple control plane instances.
 * 
 * Use cases:
 * - Same camera triggers same alert type within time window
 * - Multiple analytics engines detect same event
 * - Failover scenarios where both instances process same event
 * - Alert correlation (e.g., 100 cameras offline → 1 incident)
 * 
 * Strategy:
 * - Use Redis sets with TTL for recent alert fingerprints
 * - Alert fingerprint = hash of (cameraId, alertType, metadata)
 * - Dedupe window = configurable per alert type
 */

import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

export interface AlertFingerprint {
  cameraId?: string;
  branchId?: string;
  alertType: string;
  severity?: string;
  metadata?: Record<string, any>;
}

export interface DeduplicationResult {
  isDuplicate: boolean;
  fingerprint: string;
  existingAlertId?: string;
  firstSeenAt?: Date;
}

export interface DeduplicationConfig {
  /**
   * Dedupe window in seconds
   */
  windowSeconds: number;

  /**
   * Include metadata in fingerprint
   */
  includeMetadata?: boolean;

  /**
   * Custom fingerprint generator
   */
  fingerprintFn?: (alert: AlertFingerprint) => string;
}

export class RedisAlertDeduplicationService {
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  // Default dedupe windows per alert type
  private readonly defaultWindows: Record<string, number> = {
    'camera_offline': 300,         // 5 minutes
    'camera_online': 60,           // 1 minute
    'motion_detected': 10,         // 10 seconds
    'person_detected': 30,         // 30 seconds
    'fire_detected': 300,          // 5 minutes
    'smoke_detected': 300,         // 5 minutes
    'intrusion_detected': 60,      // 1 minute
    'loitering_detected': 120,     // 2 minutes
    'crowd_detected': 120,         // 2 minutes
    'fall_detected': 300,          // 5 minutes
    'tamper_detected': 600,        // 10 minutes
    'dvr_offline': 300,            // 5 minutes
    'storage_full': 3600,          // 1 hour
    'disk_failure': 3600,          // 1 hour
    'network_issue': 300,          // 5 minutes
    'recording_failure': 300,      // 5 minutes
    'analytics_failure': 300,      // 5 minutes
    'default': 60,                 // 1 minute
  };

  constructor(redis: Redis, keyPrefix: string = 'alert:dedupe') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  /**
   * Check if alert is duplicate and record it
   */
  async checkAndRecord(
    alert: AlertFingerprint,
    alertId: string,
    config?: Partial<DeduplicationConfig>,
  ): Promise<DeduplicationResult> {
    const fingerprint = this.generateFingerprint(alert, config);
    const key = `${this.keyPrefix}:${fingerprint}`;
    const windowSeconds = config?.windowSeconds ?? this.getDefaultWindow(alert.alertType);

    try {
      // Try to set key with NX (only if not exists)
      const wasSet = await this.redis.set(
        key,
        JSON.stringify({ alertId, timestamp: Date.now() }),
        'EX',
        windowSeconds,
        'NX',
      );

      if (wasSet === 'OK') {
        // Not a duplicate - this is the first occurrence
        return {
          isDuplicate: false,
          fingerprint,
        };
      }

      // Key already exists - this is a duplicate
      const existing = await this.redis.get(key);
      if (existing) {
        const data = JSON.parse(existing);
        return {
          isDuplicate: true,
          fingerprint,
          existingAlertId: data.alertId,
          firstSeenAt: new Date(data.timestamp),
        };
      }

      // Race condition - key was deleted between operations
      return {
        isDuplicate: false,
        fingerprint,
      };
    } catch (error) {
      console.error('[AlertDeduplication] Error checking for duplicate:', error);
      
      // FAIL OPEN: If Redis is unavailable, treat as not duplicate
      // This prevents Redis outages from blocking all alerts
      return {
        isDuplicate: false,
        fingerprint,
      };
    }
  }

  /**
   * Check if alert is duplicate (without recording)
   */
  async check(
    alert: AlertFingerprint,
    config?: Partial<DeduplicationConfig>,
  ): Promise<DeduplicationResult> {
    const fingerprint = this.generateFingerprint(alert, config);
    const key = `${this.keyPrefix}:${fingerprint}`;

    try {
      const existing = await this.redis.get(key);

      if (!existing) {
        return {
          isDuplicate: false,
          fingerprint,
        };
      }

      const data = JSON.parse(existing);
      return {
        isDuplicate: true,
        fingerprint,
        existingAlertId: data.alertId,
        firstSeenAt: new Date(data.timestamp),
      };
    } catch (error) {
      console.error('[AlertDeduplication] Error checking alert:', error);
      return {
        isDuplicate: false,
        fingerprint,
      };
    }
  }

  /**
   * Record alert fingerprint (for manual deduplication logic)
   */
  async record(
    alert: AlertFingerprint,
    alertId: string,
    config?: Partial<DeduplicationConfig>,
  ): Promise<void> {
    const fingerprint = this.generateFingerprint(alert, config);
    const key = `${this.keyPrefix}:${fingerprint}`;
    const windowSeconds = config?.windowSeconds ?? this.getDefaultWindow(alert.alertType);

    try {
      await this.redis.set(
        key,
        JSON.stringify({ alertId, timestamp: Date.now() }),
        'EX',
        windowSeconds,
      );
    } catch (error) {
      console.error('[AlertDeduplication] Error recording alert:', error);
      // Fail silently - deduplication is best-effort
    }
  }

  /**
   * Clear alert fingerprint (e.g., after alert resolution)
   */
  async clear(
    alert: AlertFingerprint,
    config?: Partial<DeduplicationConfig>,
  ): Promise<void> {
    const fingerprint = this.generateFingerprint(alert, config);
    const key = `${this.keyPrefix}:${fingerprint}`;

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('[AlertDeduplication] Error clearing alert:', error);
      // Fail silently
    }
  }

  /**
   * Get deduplication statistics
   */
  async getStats(): Promise<{
    totalFingerprints: number;
    oldestFingerprint: Date | null;
  }> {
    try {
      const pattern = `${this.keyPrefix}:*`;
      let cursor = '0';
      let count = 0;
      let oldestTimestamp: number | null = null;

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        count += keys.length;

        // Check timestamps
        for (const key of keys) {
          const value = await this.redis.get(key);
          if (value) {
            const data = JSON.parse(value);
            if (!oldestTimestamp || data.timestamp < oldestTimestamp) {
              oldestTimestamp = data.timestamp;
            }
          }
        }
      } while (cursor !== '0');

      return {
        totalFingerprints: count,
        oldestFingerprint: oldestTimestamp ? new Date(oldestTimestamp) : null,
      };
    } catch (error) {
      console.error('[AlertDeduplication] Error getting stats:', error);
      return {
        totalFingerprints: 0,
        oldestFingerprint: null,
      };
    }
  }

  /**
   * Generate alert fingerprint
   */
  private generateFingerprint(
    alert: AlertFingerprint,
    config?: Partial<DeduplicationConfig>,
  ): string {
    if (config?.fingerprintFn) {
      return config.fingerprintFn(alert);
    }

    // Default fingerprint: hash of key fields
    const parts: string[] = [
      alert.alertType,
      alert.cameraId ?? '',
      alert.branchId ?? '',
      alert.severity ?? '',
    ];

    if (config?.includeMetadata && alert.metadata) {
      // Sort keys for consistent hashing
      const sortedKeys = Object.keys(alert.metadata).sort();
      for (const key of sortedKeys) {
        parts.push(`${key}:${JSON.stringify(alert.metadata[key])}`);
      }
    }

    const input = parts.join('|');
    return createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  /**
   * Get default dedupe window for alert type
   */
  private getDefaultWindow(alertType: string): number {
    return this.defaultWindows[alertType] ?? this.defaultWindows.default!;
  }

  /**
   * Update default window for alert type
   */
  setDefaultWindow(alertType: string, windowSeconds: number): void {
    this.defaultWindows[alertType] = windowSeconds;
  }
}

/**
 * Singleton instance
 */
let instance: RedisAlertDeduplicationService | null = null;

export function getAlertDeduplicationService(redis: Redis): RedisAlertDeduplicationService {
  if (!instance) {
    instance = new RedisAlertDeduplicationService(redis);
  }
  return instance;
}

/**
 * Alert correlation helpers
 */

/**
 * Detect potential incident (multiple related alerts)
 */
export async function detectIncident(
  redis: Redis,
  alerts: AlertFingerprint[],
  correlationWindow: number = 300, // 5 minutes
): Promise<{
  isIncident: boolean;
  correlatedCount: number;
  pattern: string;
}> {
  // Group alerts by type and location
  const groups = new Map<string, AlertFingerprint[]>();

  for (const alert of alerts) {
    const groupKey = `${alert.alertType}:${alert.branchId ?? 'unknown'}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(alert);
  }

  // Check for incident patterns
  for (const [pattern, groupAlerts] of groups.entries()) {
    if (groupAlerts.length >= 5) {
      // 5+ similar alerts = incident
      return {
        isIncident: true,
        correlatedCount: groupAlerts.length,
        pattern,
      };
    }
  }

  return {
    isIncident: false,
    correlatedCount: 0,
    pattern: '',
  };
}

/**
 * Regional outage detection
 */
export async function detectRegionalOutage(
  redis: Redis,
  offlineCameras: Array<{ cameraId: string; branchId: string }>,
  threshold: number = 10, // 10+ cameras = potential regional issue
): Promise<{
  isRegionalOutage: boolean;
  affectedBranches: string[];
  affectedCameras: number;
}> {
  const branchCounts = new Map<string, number>();

  for (const camera of offlineCameras) {
    const count = branchCounts.get(camera.branchId) ?? 0;
    branchCounts.set(camera.branchId, count + 1);
  }

  const affectedBranches = Array.from(branchCounts.entries())
    .filter(([_, count]) => count >= 3) // 3+ cameras per branch
    .map(([branchId]) => branchId);

  return {
    isRegionalOutage: offlineCameras.length >= threshold && affectedBranches.length >= 3,
    affectedBranches,
    affectedCameras: offlineCameras.length,
  };
}
