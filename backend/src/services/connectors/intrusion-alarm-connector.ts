import { Pool } from 'pg';
import { BaseConnector } from './base-connector';
import { ExternalEventInput } from '../integration-gateway.service';
import { logger } from '../../utils/logger';

/**
 * Intrusion Alarm System Connector
 * Integrates with intrusion detection and panic alarm systems
 */
export class IntrusionAlarmConnector extends BaseConnector {
  constructor(pool: Pool, connectorId: string, config: Record<string, any>) {
    super(pool, connectorId, 'intrusion-alarm', config);
  }

  async connect(): Promise<void> {
    try {
      this.isConnected = true;
      logger.info('Intrusion Alarm connector connected', { connectorId: this.connectorId });
      await this.recordHealthCheck('healthy');
    } catch (error) {
      logger.error('Failed to connect Intrusion Alarm connector', {
        connectorId: this.connectorId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await this.recordHealthCheck('error', undefined, 
        error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.isConnected = false;
    logger.info('Intrusion Alarm connector disconnected', { connectorId: this.connectorId });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.recordHealthCheck('healthy');
      return { healthy: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      await this.recordHealthCheck('error', undefined, message);
      return { healthy: false, message };
    }
  }

  protected normalizeEvent(rawEvent: any): ExternalEventInput {
    const eventTypeMap: Record<string, string> = {
      'pir_motion': 'pir-motion-alarm',
      'glass_break': 'glass-break-alarm',
      'magnetic_contact': 'magnetic-contact-alarm',
      'shutter_alarm': 'shutter-alarm',
      'perimeter_beam': 'perimeter-beam-alarm',
      'panic_alarm': 'panic-alarm',
      'seismic_alarm': 'seismic-vibration-alarm',
      'zone_armed': 'zone-armed',
      'zone_disarmed': 'zone-disarmed',
      'tamper_alarm': 'tamper-alarm',
      'panel_offline': 'panel-communication-failure'
    };

    const severityMap: Record<string, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
      'panic_alarm': 'critical',
      'glass_break': 'critical',
      'shutter_alarm': 'critical',
      'tamper_alarm': 'high',
      'pir_motion': 'high',
      'zone_armed': 'info',
      'zone_disarmed': 'info'
    };

    return {
      eventId: rawEvent.event_id || rawEvent.id,
      connectorId: this.connectorId,
      sourceSystem: 'intrusion-alarm',
      sourceDeviceId: rawEvent.sensor_id || rawEvent.device_id,
      eventType: eventTypeMap[rawEvent.event_type] || rawEvent.event_type,
      occurredAt: new Date(rawEvent.timestamp || rawEvent.occurred_at),
      severity: severityMap[rawEvent.event_type] || 'medium',
      subject: {},
      metadata: {
        sensorType: rawEvent.sensor_type,
        panelId: rawEvent.panel_id,
        zoneName: rawEvent.zone_name,
        armedState: rawEvent.armed_state,
        tamperDetected: rawEvent.tamper_detected
      },
      rawPayload: rawEvent
    };
  }

  async storeIntrusionAlarmEvent(externalEventId: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO intrusion_alarm_events 
       (external_event_id, sensor_id, panel_id, alarm_type, zone_name,
        armed_state, tamper_detected)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        externalEventId,
        eventData.sensorId,
        eventData.panelId,
        eventData.alarmType,
        eventData.zoneName,
        eventData.armedState,
        eventData.tamperDetected || false
      ]
    );
  }
}
