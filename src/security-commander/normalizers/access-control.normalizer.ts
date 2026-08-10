/**
 * Access Control Event Normalizer
 * 
 * Normalizes access control events from various systems.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawAccessControlEvent extends RawEvent {
  doorId: string;
  eventType: 'granted' | 'denied' | 'forced' | 'held_open' | 'propped' | 'tailgating';
  timestamp: Date | string;
  badgeId?: string;
  userId?: string;
  personName?: string;
  branchId?: string;
  zoneId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class AccessControlEventNormalizer extends BaseEventNormalizer<RawAccessControlEvent> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'doorId' in raw && 'eventType' in raw;
  }

  normalize(raw: RawAccessControlEvent, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapEventType(raw.eventType);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'access-controller',
        id: raw.doorId,
        name: raw.metadata?.doorName as string | undefined,
      },
      severity,
      location: raw.zoneId ? {
        zoneId: raw.zoneId,
        zone: raw.metadata?.zoneName as string | undefined,
      } : undefined,
      entities: {
        doorId: raw.doorId,
        badgeId: raw.badgeId,
        userId: raw.userId,
        zoneId: raw.zoneId,
      },
      metadata: {
        ...raw.metadata,
        originalEventType: raw.eventType,
        personName: raw.personName,
        reason: raw.reason,
        normalizedBy: 'AccessControlEventNormalizer',
      },
    };
  }

  private mapEventType(rawType: string): { eventType: SecurityEventType; severity: SecuritySeverity } {
    switch (rawType) {
      case 'granted':
        return { eventType: 'access.granted', severity: 'info' };
      case 'denied':
        return { eventType: 'access.denied', severity: 'medium' };
      case 'forced':
      case 'door_forced':
        return { eventType: 'access.door_forced', severity: 'critical' };
      case 'held_open':
      case 'door_held_open':
        return { eventType: 'access.door_held_open', severity: 'high' };
      case 'propped':
      case 'door_propped':
        return { eventType: 'access.door_propped', severity: 'high' };
      case 'tailgating':
        return { eventType: 'access.door_held_open', severity: 'high' }; // Map to held_open for now
      default:
        return { eventType: 'access.denied', severity: 'medium' };
    }
  }
}
