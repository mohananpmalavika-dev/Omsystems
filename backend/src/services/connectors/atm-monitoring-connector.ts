import { Pool } from 'pg';
import { BaseConnector } from './base-connector';
import { ExternalEventInput } from '../integration-gateway.service';
import { logger } from '../../utils/logger';

/**
 * ATM Monitoring System Connector
 * Integrates with ATM operational, security and transaction monitoring
 */
export class ATMMonitoringConnector extends BaseConnector {
  constructor(pool: Pool, connectorId: string, config: Record<string, any>) {
    super(pool, connectorId, 'atm-monitoring', config);
  }

  async connect(): Promise<void> {
    try {
      this.isConnected = true;
      logger.info('ATM Monitoring connector connected', { connectorId: this.connectorId });
      await this.recordHealthCheck('healthy');
    } catch (error) {
      logger.error('Failed to connect ATM Monitoring connector', {
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
    logger.info('ATM Monitoring connector disconnected', { connectorId: this.connectorId });
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
      'atm_offline': 'atm-offline',
      'cash_dispenser_error': 'cash-dispenser-error',
      'card_reader_fault': 'card-reader-fault',
      'cash_door_opened': 'cash-door-opened',
      'safe_door_opened': 'safe-door-opened',
      'atm_tampering': 'atm-tampering',
      'skimming_alert': 'skimming-device-alert',
      'vibration_alert': 'vibration-drilling-alert',
      'cabinet_opened': 'cabinet-opened',
      'power_failure': 'power-failure',
      'network_failure': 'network-failure',
      'transaction_dispute': 'transaction-dispute',
      'cash_withdrawal': 'cash-withdrawal-event',
      'failed_transaction': 'failed-transaction',
      'replenishment_started': 'cash-replenishment-started',
      'replenishment_completed': 'cash-replenishment-completed',
      'technician_login': 'technician-login',
      'panic_event': 'atm-panic-event'
    };

    const severityMap: Record<string, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
      'atm_tampering': 'critical',
      'skimming_alert': 'critical',
      'vibration_alert': 'critical',
      'panic_event': 'critical',
      'safe_door_opened': 'high',
      'cabinet_opened': 'high',
      'cash_dispenser_error': 'medium',
      'transaction_dispute': 'medium',
      'cash_withdrawal': 'info',
      'replenishment_started': 'info'
    };

    return {
      eventId: rawEvent.event_id || rawEvent.id,
      connectorId: this.connectorId,
      sourceSystem: 'atm-monitoring',
      sourceDeviceId: rawEvent.atm_id,
      eventType: eventTypeMap[rawEvent.event_type] || rawEvent.event_type,
      occurredAt: new Date(rawEvent.timestamp || rawEvent.occurred_at),
      severity: severityMap[rawEvent.event_type] || 'medium',
      subject: {
        transactionId: rawEvent.transaction_id,
        cardNumberMasked: rawEvent.card_number_masked,
        technicianId: rawEvent.technician_id
      },
      metadata: {
        atmId: rawEvent.atm_id,
        eventCategory: rawEvent.event_category,
        cashAmount: rawEvent.cash_amount,
        errorCode: rawEvent.error_code,
        workOrderId: rawEvent.work_order_id
      },
      rawPayload: rawEvent
    };
  }

  async storeATMMonitoringEvent(externalEventId: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO atm_monitoring_events 
       (external_event_id, atm_id, event_category, transaction_id, cash_amount,
        card_number_masked, error_code, technician_id, work_order_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        externalEventId,
        eventData.atmId,
        eventData.eventCategory,
        eventData.transactionId,
        eventData.cashAmount,
        eventData.cardNumberMasked,
        eventData.errorCode,
        eventData.technicianId,
        eventData.workOrderId
      ]
    );
  }
}
