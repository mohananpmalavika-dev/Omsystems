/**
 * Camera Event Normalizer
 * 
 * Normalizes camera health and status events from various sources.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawCameraEvent extends RawEvent {
  cameraId: string;
  eventType: 'online' | 'offline' | 'motion' | 'tamper' | 'stream_lost' | 'stream_restored' | 'video_loss' | 'camera_blocked';
  timestamp: Date | string;
  branchId?: string;
  location?: {
    building?: string;
    floor?: string;
    zone?: string;
  };
  metadata?: Record<string, unknown>;
}

export class CameraEventNormalizer extends BaseEventNormalizer<RawCameraEvent> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'cameraId' in raw && 'eventType' in raw;
  }

  normalize(raw: RawCameraEvent, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapEventType(raw.eventType);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'camera',
        id: raw.cameraId,
        name: raw.metadata?.cameraName as string | undefined,
      },
      severity,
      location: raw.location ? {
        building: raw.location.building,
        floor: raw.location.floor,
        zone: raw.location.zone,
        zoneId: raw.location.zone,
      } : undefined,
      entities: {
        cameraId: raw.cameraId,
      },
      metadata: {
        ...raw.metadata,
        originalEventType: raw.eventType,
        normalizedBy: 'CameraEventNormalizer',
      },
    };
  }

  private mapEventType(rawType: string): { eventType: SecurityEventType; severity: SecuritySeverity } {
    switch (rawType) {
      case 'offline':
        return { eventType: 'camera.offline', severity: 'high' };
      case 'online':
        return { eventType: 'camera.online', severity: 'info' };
      case 'motion':
        return { eventType: 'camera.motion', severity: 'low' };
      case 'tamper':
      case 'camera_tamper':
        return { eventType: 'camera.tamper', severity: 'critical' };
      case 'stream_lost':
      case 'video_loss':
        return { eventType: 'camera.stream_lost', severity: 'high' };
      case 'stream_restored':
        return { eventType: 'camera.stream_restored', severity: 'info' };
      case 'camera_blocked':
      case 'blocking':
        return { eventType: 'camera.blocking', severity: 'high' };
      default:
        return { eventType: 'camera.motion', severity: 'low' };
    }
  }
}
