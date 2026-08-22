/**
 * Network Event Normalizer
 * 
 * Normalizes network device health and connectivity events.
 */

import { BaseEventNormalizer, type NormalizationContext, type RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput, SecurityEventType, SecuritySeverity } from '../types/index.js';

export interface RawNetworkEvent extends RawEvent {
  deviceId: string;
  deviceType: 'switch' | 'router' | 'camera' | 'recorder' | 'access-controller' | 'generic';
  eventType: 'unreachable' | 'reachable' | 'packet_loss' | 'high_latency' | 'link_down' | 'link_up' | 'bandwidth_exceeded';
  timestamp: Date | string;
  branchId?: string;
  ipAddress?: string;
  macAddress?: string;
  packetLossPercent?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

export class NetworkEventNormalizer extends BaseEventNormalizer<RawNetworkEvent> {
  canHandle(raw: any): boolean {
    return raw && typeof raw === 'object' && 'deviceId' in raw && 'deviceType' in raw;
  }

  normalize(raw: RawNetworkEvent, context: NormalizationContext): CreateSecurityEventInput {
    const tenantContext = this.extractTenantContext(raw, context);
    const timestamp = this.ensureValidTimestamp(this.parseTimestamp(raw.timestamp));

    const { eventType, severity } = this.mapEventType(raw.eventType, raw.deviceType);

    return {
      type: eventType,
      timestamp,
      ...tenantContext,
      source: {
        type: 'network-device',
        id: raw.deviceId,
        name: raw.metadata?.deviceName as string | undefined,
      },
      severity,
      entities: {
        networkDeviceId: raw.deviceId,
        deviceId: raw.deviceId,
      },
      metadata: {
        ...raw.metadata,
        originalEventType: raw.eventType,
        deviceType: raw.deviceType,
        ipAddress: raw.ipAddress,
        macAddress: raw.macAddress,
        packetLossPercent: raw.packetLossPercent,
        latencyMs: raw.latencyMs,
        normalizedBy: 'NetworkEventNormalizer',
      },
    };
  }

  private mapEventType(
    rawType: string,
    deviceType: string
  ): { eventType: SecurityEventType; severity: SecuritySeverity } {
    // Severity depends on device type
    const isCriticalDevice = deviceType === 'switch' || deviceType === 'router';

    switch (rawType) {
      case 'unreachable':
        return {
          eventType: 'network.device_unreachable',
          severity: isCriticalDevice ? 'critical' : 'high',
        };
      case 'reachable':
        return { eventType: 'network.device_reachable', severity: 'info' };
      case 'packet_loss':
        return { eventType: 'network.packet_loss', severity: 'medium' };
      case 'high_latency':
        return { eventType: 'network.high_latency', severity: 'low' };
      case 'link_down':
        return {
          eventType: 'network.link_down',
          severity: isCriticalDevice ? 'critical' : 'high',
        };
      case 'link_up':
        return { eventType: 'network.link_up', severity: 'info' };
      case 'bandwidth_exceeded':
        return { eventType: 'network.bandwidth_exceeded', severity: 'medium' };
      default:
        return { eventType: 'network.device_unreachable', severity: 'medium' };
    }
  }
}
