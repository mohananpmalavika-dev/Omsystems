/**
 * Recorder/NVR Event Normalizer
 * 
 * Normalizes recorder health and recording status events.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawRecorderEvent extends RawEvent {
  recorderId: string;
  eventType: 'offline' | 'online' | 'recording_stopped' | 'recording_started' | 'channel_missing' | 'channel_restored' | 'disk_error' | 'auth_failure';
  timestamp: Date | string;
  branchId?: string;
  channelId?: string;
  cameraId?: string;
  errorDetails?: string;
  metadata?: Record<string, unknown>;
}

export class RecorderEventNormalizer extends BaseEventNormalizer<RawRecorderEvent> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'recorderId' in raw && 'eventType' in raw;
  }

  normalize(raw: RawRecorderEvent, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapEventType(raw.eventType);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'recorder',
        id: raw.recorderId,
        name: raw.metadata?.recorderName as string | undefined,
      },
      severity,
      entities: {
        recorderId: raw.recorderId,
        cameraId: raw.cameraId,
      },
      metadata: {
        ...raw.metadata,
        originalEventType: raw.eventType,
        channelId: raw.channelId,
        errorDetails: raw.errorDetails,
        normalizedBy: 'RecorderEventNormalizer',
      },
    };
  }

  private mapEventType(rawType: string): { eventType: SecurityEventType; severity: SecuritySeverity } {
    switch (rawType) {
      case 'offline':
        return { eventType: 'recorder.offline', severity: 'critical' };
      case 'online':
        return { eventType: 'recorder.online', severity: 'info' };
      case 'recording_stopped':
        return { eventType: 'recorder.recording_stopped', severity: 'critical' };
      case 'recording_started':
        return { eventType: 'recorder.recording_started', severity: 'info' };
      case 'channel_missing':
        return { eventType: 'recorder.channel_missing', severity: 'high' };
      case 'channel_restored':
        return { eventType: 'recorder.channel_restored', severity: 'info' };
      case 'disk_error':
        return { eventType: 'recorder.disk_error', severity: 'critical' };
      case 'auth_failure':
      case 'authentication_failure':
        return { eventType: 'recorder.authentication_failure', severity: 'high' };
      default:
        return { eventType: 'recorder.offline', severity: 'high' };
    }
  }
}
