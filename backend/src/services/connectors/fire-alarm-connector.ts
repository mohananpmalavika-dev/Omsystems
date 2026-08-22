import { Pool } from 'pg';
import { BaseConnector } from './base-connector';
import { ExternalEventInput } from '../integration-gateway.service';
import { logger } from '../../utils/logger';

/**
 * Fire Alarm System Connector
 * Integrates with fire detection and alarm systems
 */
export class FireAlarmConnector extends BaseConnector {
  constructor(pool: Pool, connectorId: string, config: Record<string, any>) {
    super(pool, connectorId, 'fire-alarm', config);
  }

  async connect(): Promise<void> {
    try {
      // Initialize connection based on protocol (MQTT, TCP/IP, etc.)
      this.isConnected = true;
      logger.info('Fire Alarm connector connected', { connectorId: this.connectorId });
      await this.recordHealthCheck('healthy');
    } catch (error) {
      logger.error('Failed to connect Fire Alarm connector', {
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
    logger.info('Fire Alarm connector disconnected', { connectorId: this.connectorId });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Perform health check
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
      'smoke_detected': 'smoke-detector-activated',
      'heat_detected': 'heat-detector-activated',
      'manual_alarm': 'manual-call-point-activated',
      'panel_alarm': 'fire-panel-alarm',
      'sprinkler_flow': 'sprinkler-flow-alarm',
      'fire_pump_started': 'fire-pump-started',
      'alarm_acknowledged': 'alarm-acknowledged',
      'alarm_silenced': 'alarm-silenced',
      'alarm_reset': 'alarm-reset',
      'detector_fault': 'detector-fault',
      'panel_offline': 'fire-panel-offline'
    };

    // All fire events are high severity by default
    const severity = rawEvent.event_type.includes('fault') || rawEvent.event_type.includes('offline')
      ? 'medium'
      : 'critical';

    return {
      eventId: rawEvent.event_id || rawEvent.id,
      connectorId: this.connectorId,
      sourceSystem: 'fire-alarm',
      sourceDeviceId: rawEvent.detector_id || rawEvent.device_id,
      eventType: eventTypeMap[rawEvent.event_type] || rawEvent.event_type,
      occurredAt: new Date(rawEvent.timestamp || rawEvent.occurred_at),
      severity: severity as any,
      subject: {},
      metadata: {
        detectorType: rawEvent.detector_type,
        panelId: rawEvent.panel_id,
        zoneName: rawEvent.zone_name,
        alarmState: rawEvent.alarm_state,
        temperature: rawEvent.temperature,
        smokeLevel: rawEvent.smoke_level
      },
      rawPayload: rawEvent
    };
  }

  async storeFireAlarmEvent(externalEventId: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO fire_alarm_events 
       (external_event_id, detector_id, panel_id, alarm_type, zone_name, 
        alarm_state, detector_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        externalEventId,
        eventData.detectorId,
        eventData.panelId,
        eventData.alarmType,
        eventData.zoneName,
        eventData.alarmState,
        eventData.detectorType
      ]
    );
  }
}
