/**
 * AI Detection Event Normalizer
 * 
 * Normalizes AI detection events from analytics engine.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawAIDetection extends RawEvent {
  cameraId: string;
  detectionType: string;
  timestamp: Date | string;
  confidence: number;
  branchId?: string;
  zoneId?: string;
  boundingBoxes?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  trackIds?: string[];
  snapshot?: string;
  clip?: string;
  metadata?: Record<string, unknown>;
}

export class AIDetectionNormalizer extends BaseEventNormalizer<RawAIDetection> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'detectionType' in raw && 'confidence' in raw;
  }

  normalize(raw: RawAIDetection, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapDetectionType(raw.detectionType, raw.confidence);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'ai',
        id: raw.cameraId,
        name: raw.metadata?.cameraName as string | undefined,
      },
      severity,
      confidence: raw.confidence,
      location: raw.zoneId ? {
        zoneId: raw.zoneId,
        zone: raw.metadata?.zoneName as string | undefined,
      } : undefined,
      entities: {
        cameraId: raw.cameraId,
        zoneId: raw.zoneId,
      },
      evidence: {
        snapshotUrl: raw.snapshot,
        clipUrl: raw.clip,
      },
      metadata: {
        ...raw.metadata,
        detectionType: raw.detectionType,
        boundingBoxes: raw.boundingBoxes,
        trackIds: raw.trackIds,
        normalizedBy: 'AIDetectionNormalizer',
      },
    };
  }

  private mapDetectionType(
    detectionType: string,
    confidence: number
  ): { eventType: SecurityEventType; severity: SecuritySeverity } {
    // Map detection types to security event types
    switch (detectionType.toLowerCase()) {
      case 'person':
      case 'person_detected':
        return { eventType: 'ai.person_detected', severity: 'info' };

      case 'vehicle':
      case 'vehicle_detected':
        return { eventType: 'ai.vehicle_detected', severity: 'info' };

      case 'intrusion':
      case 'perimeter_breach':
        return { eventType: 'ai.intrusion', severity: confidence > 0.8 ? 'critical' : 'high' };

      case 'loitering':
        return { eventType: 'ai.loitering', severity: 'medium' };

      case 'crowd':
      case 'crowd_detected':
        return { eventType: 'ai.crowd_detected', severity: 'medium' };

      case 'face_match':
      case 'face_recognized':
        return { eventType: 'ai.face_match', severity: 'info' };

      case 'face_unknown':
      case 'unknown_person':
        return { eventType: 'ai.face_unknown', severity: 'low' };

      case 'fire':
      case 'fire_detected':
        return { eventType: 'ai.fire_detected', severity: 'critical' };

      case 'smoke':
      case 'smoke_detected':
        return { eventType: 'ai.smoke_detected', severity: 'critical' };

      case 'ppe_violation':
      case 'no_helmet':
      case 'no-helmet':
      case 'no_vest':
        return { eventType: 'ai.ppe_violation', severity: 'high' };

      case 'helmet':
      case 'helmet-worn':
      case 'helmet_worn':
        return { eventType: 'ai.intrusion', severity: 'high' };

      case 'weapon':
      case 'weapon_detected':
        return { eventType: 'ai.weapon_detected', severity: 'critical' };

      case 'fall':
      case 'fall_detected':
      case 'person_down':
        return { eventType: 'ai.fall_detected', severity: 'critical' };

      case 'tailgating':
        return { eventType: 'ai.tailgating', severity: 'high' };

      case 'queue':
      case 'queue_detected':
        return { eventType: 'ai.queue_detected', severity: 'low' };

      case 'unattended_object':
      case 'unattended_baggage':
        return { eventType: 'ai.unattended_object', severity: 'high' };

      case 'removed_object':
        return { eventType: 'ai.removed_object', severity: 'medium' };

      case 'line_crossing':
        return { eventType: 'ai.line_crossing', severity: 'medium' };

      case 'perimeter_breach':
        return { eventType: 'ai.perimeter_breach', severity: 'critical' };

      default:
        return { eventType: 'ai.person_detected', severity: 'info' };
    }
  }
}
