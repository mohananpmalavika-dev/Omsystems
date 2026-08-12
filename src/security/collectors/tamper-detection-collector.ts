/**
 * Physical Tamper Detection Collector
 * Monitors edge devices for physical tampering attempts
 */

import { BaseEvidenceCollector, type SecurityEvidence, EvidenceSource } from './base-evidence-collector.js';
import type { EvidenceCollectorConfig } from '../types.js';

export interface TamperEvent {
  deviceId: string;
  deviceName: string;
  eventType: 'case_opened' | 'motion_detected' | 'voltage_anomaly' | 'temperature_spike' | 'accelerometer_trigger';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  location?: string;
  details: string;
  resolved: boolean;
}

export interface TamperDetectionEvidence extends SecurityEvidence {
  type: 'tamper_detection';
  value: {
    totalDevices: number;
    devicesMonitored: number;
    tamperEventsLast24h: number;
    unresolvedEvents: number;
    criticalEvents: number;
    recentEvents: TamperEvent[];
  };
}

export class TamperDetectionCollector extends BaseEvidenceCollector {
  readonly id = 'tamper-detection';
  readonly name = 'Physical Tamper Detection';
  readonly description = 'Monitors edge devices for physical tampering attempts';

  constructor(config: EvidenceCollectorConfig = { enabled: true }) {
    super('Physical Tamper Detection', 'threat_detection', config);
  }

  async collect(): Promise<SecurityEvidence[]> {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    try {
      const devices = await this.getMonitoredDevices();
      const tamperEvents = await this.getTamperEvents(last24h);
      
      const totalDevices = devices.length;
      const devicesMonitored = devices.filter(d => d.tamperDetectionEnabled).length;
      const tamperEventsLast24h = tamperEvents.length;
      const unresolvedEvents = tamperEvents.filter(e => !e.resolved).length;
      const criticalEvents = tamperEvents.filter(e => e.severity === 'critical').length;
      
      // Get 10 most recent events
      const recentEvents = tamperEvents
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 10);

      // Calculate confidence (100% if no unresolved critical events)
      const confidence = criticalEvents === 0 ? 100 : Math.max(0, 100 - (criticalEvents * 20));

      return [
        this.createEvidence(
          {
            totalDevices,
            devicesMonitored,
            tamperEventsLast24h,
            unresolvedEvents,
            criticalEvents,
            recentEvents,
          },
          confidence,
          {
            collector: this.id,
            version: '1.0.0',
            collectionMethod: this.isSimulation() ? 'simulation' : 'edge_agent_telemetry',
          }
        )
      ];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Tamper detection collection error:', errorMessage);
      throw error;
    }
  }

  /**
   * Get monitored devices
   */
  private async getMonitoredDevices(): Promise<Array<{ id: string; tamperDetectionEnabled: boolean }>> {
    if (this.isSimulation()) {
      return [
        { id: 'device-001', tamperDetectionEnabled: true },
        { id: 'device-002', tamperDetectionEnabled: true },
        { id: 'device-003', tamperDetectionEnabled: false },
      ];
    }

    // Real implementation would query device database
    return [];
  }

  /**
   * Get tamper events since timestamp
   */
  private async getTamperEvents(since: Date): Promise<TamperEvent[]> {
    if (this.isSimulation()) {
      return [
        {
          deviceId: 'device-001',
          deviceName: 'Edge Agent - Branch 5',
          eventType: 'case_opened',
          severity: 'high',
          timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
          location: 'Branch 5, Server Room',
          details: 'Device case opened without authorization',
          resolved: false,
        },
      ];
    }

    // Real implementation would query tamper event database
    return [];
  }

  /**
   * Check if running in simulation mode
   */
  private isSimulation(): boolean {
    return process.env.TAMPER_SIMULATION_MODE === 'true' || !process.env.EDGE_AGENT_API;
  }

  /**
   * Resolve tamper event
   */
  async resolveEvent(deviceId: string, eventId: string, notes: string): Promise<void> {
    if (this.isSimulation()) {
      console.log(`[SIMULATION] Resolving tamper event ${eventId} for device ${deviceId}`);
      return;
    }

    // TODO: Update tamper event in database
  }
}
