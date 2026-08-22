/**
 * Storage Event Normalizer
 * 
 * Normalizes storage health and capacity events.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawStorageEvent extends RawEvent {
  storageId: string;
  eventType: 'low' | 'critical' | 'full' | 'disk_failed' | 'raid_degraded' | 'write_error' | 'archive_failed';
  timestamp: Date | string;
  branchId?: string;
  freePercent?: number;
  freeBytes?: number;
  totalBytes?: number;
  diskId?: string;
  metadata?: Record<string, unknown>;
}

export class StorageEventNormalizer extends BaseEventNormalizer<RawStorageEvent> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'storageId' in raw && 'eventType' in raw;
  }

  normalize(raw: RawStorageEvent, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapEventType(raw.eventType, raw.freePercent);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'storage',
        id: raw.storageId,
        name: raw.metadata?.storageName as string | undefined,
      },
      severity,
      entities: {
        storageId: raw.storageId,
      },
      metadata: {
        ...raw.metadata,
        originalEventType: raw.eventType,
        freePercent: raw.freePercent,
        freeBytes: raw.freeBytes,
        totalBytes: raw.totalBytes,
        diskId: raw.diskId,
        normalizedBy: 'StorageEventNormalizer',
      },
    };
  }

  private mapEventType(
    rawType: string,
    freePercent?: number
  ): { eventType: SecurityEventType; severity: SecuritySeverity } {
    switch (rawType) {
      case 'low':
        return {
          eventType: 'storage.low',
          severity: freePercent !== undefined && freePercent < 5 ? 'critical' : 'high',
        };
      case 'critical':
        return { eventType: 'storage.critical', severity: 'critical' };
      case 'full':
        return { eventType: 'storage.full', severity: 'critical' };
      case 'disk_failed':
        return { eventType: 'storage.disk_failed', severity: 'critical' };
      case 'raid_degraded':
        return { eventType: 'storage.raid_degraded', severity: 'critical' };
      case 'write_error':
        return { eventType: 'storage.write_error', severity: 'high' };
      case 'archive_failed':
        return { eventType: 'storage.archive_failed', severity: 'medium' };
      default:
        return { eventType: 'storage.low', severity: 'medium' };
    }
  }
}
