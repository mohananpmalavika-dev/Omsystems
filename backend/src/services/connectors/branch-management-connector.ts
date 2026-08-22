import { Pool } from 'pg';
import { BaseConnector } from './base-connector';
import { ExternalEventInput } from '../integration-gateway.service';
import { logger } from '../../utils/logger';

/**
 * Branch Management System Connector
 * Provides operational context to security events
 */
export class BranchManagementConnector extends BaseConnector {
  constructor(pool: Pool, connectorId: string, config: Record<string, any>) {
    super(pool, connectorId, 'branch-management', config);
  }

  async connect(): Promise<void> {
    try {
      this.isConnected = true;
      logger.info('Branch Management connector connected', { connectorId: this.connectorId });
      await this.recordHealthCheck('healthy');
    } catch (error) {
      logger.error('Failed to connect Branch Management connector', {
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
    logger.info('Branch Management connector disconnected', { connectorId: this.connectorId });
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
      'branch_opening': 'branch-opening',
      'branch_closing': 'branch-closing',
      'cash_movement': 'cash-movement',
      'maintenance_window': 'maintenance-window',
      'shift_change': 'shift-change',
      'vault_access': 'vault-access-scheduled',
      'vendor_visit': 'vendor-visit',
      'emergency_contact_update': 'emergency-contact-update'
    };

    return {
      eventId: rawEvent.event_id || rawEvent.id,
      connectorId: this.connectorId,
      sourceSystem: 'branch-management',
      sourceDeviceId: rawEvent.branch_code,
      eventType: eventTypeMap[rawEvent.event_type] || rawEvent.event_type,
      occurredAt: new Date(rawEvent.timestamp || rawEvent.occurred_at),
      severity: 'info',
      subject: {
        staffId: rawEvent.staff_id,
        shiftId: rawEvent.shift_id
      },
      metadata: {
        operationType: rawEvent.operation_type,
        workOrderId: rawEvent.work_order_id,
        maintenanceWindowStart: rawEvent.maintenance_window_start,
        maintenanceWindowEnd: rawEvent.maintenance_window_end,
        suppressedAlerts: rawEvent.suppressed_alerts
      },
      rawPayload: rawEvent
    };
  }

  async storeBranchOperationalEvent(externalEventId: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO branch_operational_events 
       (external_event_id, operation_type, staff_id, shift_id, work_order_id,
        maintenance_window_start, maintenance_window_end, suppressed_alerts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        externalEventId,
        eventData.operationType,
        eventData.staffId,
        eventData.shiftId,
        eventData.workOrderId,
        eventData.maintenanceWindowStart,
        eventData.maintenanceWindowEnd,
        eventData.suppressedAlerts
      ]
    );
  }
}
