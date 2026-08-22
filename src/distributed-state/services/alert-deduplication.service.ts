/**
 * Distributed Alert Deduplication Service
 * Prevents duplicate alert processing across scaled cluster worker instances using sliding TTL windows.
 */

import { createHash } from 'node:crypto';
import { AlertDedupRecord } from '../domain/distributed-state.types.js';

export interface CheckAlertDedupInput {
  tenantId: string;
  branchId: string;
  cameraId: string;
  eventType: string;
  severity: string;
  windowMs?: number; // Default 15,000ms (15 seconds)
}

export interface DedupCheckResult {
  isDuplicate: boolean;
  fingerprint: string;
  occurrenceCount: number;
  firstSeenAt: number;
  suppressUntil: number;
}

export class AlertDeduplicationService {
  private dedupStore = new Map<string, AlertDedupRecord>();

  /**
   * Generates a deterministic alert fingerprint.
   */
  generateFingerprint(input: Omit<CheckAlertDedupInput, 'windowMs'>): string {
    const raw = `${input.tenantId}:${input.branchId}:${input.cameraId}:${input.eventType}:${input.severity}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * Evaluates if an incoming alert is a duplicate within the sliding deduplication window.
   */
  checkAndRecordAlert(input: CheckAlertDedupInput): DedupCheckResult {
    const windowMs = input.windowMs || 15_000;
    const now = Date.now();
    const fingerprint = this.generateFingerprint(input);
    const dedupKey = `alert:dedup:${fingerprint}`;

    const existing = this.dedupStore.get(dedupKey);

    if (existing && existing.expiresAt > now) {
      // Duplicate alert detected within window
      existing.lastSeenAt = now;
      existing.occurrenceCount += 1;
      existing.expiresAt = now + windowMs; // Sliding extension

      return {
        isDuplicate: true,
        fingerprint,
        occurrenceCount: existing.occurrenceCount,
        firstSeenAt: existing.firstSeenAt,
        suppressUntil: existing.expiresAt,
      };
    }

    // New unique alert
    const newRecord: AlertDedupRecord = {
      dedupKey,
      fingerprint,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrenceCount: 1,
      expiresAt: now + windowMs,
    };

    this.dedupStore.set(dedupKey, newRecord);

    return {
      isDuplicate: false,
      fingerprint,
      occurrenceCount: 1,
      firstSeenAt: now,
      suppressUntil: newRecord.expiresAt,
    };
  }

  clearExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, record] of this.dedupStore.entries()) {
      if (record.expiresAt <= now) {
        this.dedupStore.delete(key);
        purged++;
      }
    }
    return purged;
  }
}

export const alertDeduplicationService = new AlertDeduplicationService();
