import { Pool } from 'pg';
import axios from 'axios';
import { BaseConnector } from './base-connector';
import { ExternalEventInput } from '../integration-gateway.service';
import { logger } from '../../utils/logger';

/**
 * Access Control System Connector
 * Integrates with door access and physical security systems
 */
export class AccessControlConnector extends BaseConnector {
  private pollingInterval?: NodeJS.Timeout;
  private webhookServer?: any;

  constructor(pool: Pool, connectorId: string, config: Record<string, any>) {
    super(pool, connectorId, 'access-control', config);
  }

  async connect(): Promise<void> {
    try {
      const connectionMethod = this.getConfig('connectionMethod', 'webhook');

      if (connectionMethod === 'webhook') {
        await this.setupWebhook();
      } else if (connectionMethod === 'polling') {
        await this.setupPolling();
      }

      this.isConnected = true;
      logger.info('Access Control connector connected', {
        connectorId: this.connectorId,
        method: connectionMethod
      });

      await this.recordHealthCheck('healthy');
    } catch (error) {
      logger.error('Failed to connect Access Control connector', {
        connectorId: this.connectorId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await this.recordHealthCheck('error', undefined, 
        error instanceof Error ? error.message : 'Connection failed');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    if (this.webhookServer) {
      // Cleanup webhook server
    }

    this.isConnected = false;
    logger.info('Access Control connector disconnected', {
      connectorId: this.connectorId
    });
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      const startTime = Date.now();
      const endpoint = this.getConfig('healthCheckEndpoint');

      if (endpoint) {
        await axios.get(endpoint, {
          timeout: 5000,
          headers: this.getAuthHeaders()
        });
      }

      const responseTime = Date.now() - startTime;
      await this.recordHealthCheck('healthy', responseTime);

      return { healthy: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Health check failed';
      await this.recordHealthCheck('error', undefined, message);
      return { healthy: false, message };
    }
  }

  protected normalizeEvent(rawEvent: any): ExternalEventInput {
    const eventTypeMap: Record<string, string> = {
      'access_granted': 'access-granted',
      'access_denied': 'access-denied',
      'door_opened': 'door-opened',
      'door_closed': 'door-closed',
      'door_held_open': 'door-held-open',
      'door_forced_open': 'door-forced-open',
      'invalid_card': 'invalid-card',
      'expired_credential': 'expired-credential',
      'biometric_failure': 'biometric-failure'
    };

    const severityMap: Record<string, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
      'door_forced_open': 'critical',
      'access_denied': 'medium',
      'door_held_open': 'high',
      'invalid_card': 'low',
      'access_granted': 'info'
    };

    return {
      eventId: rawEvent.event_id || rawEvent.id,
      connectorId: this.connectorId,
      sourceSystem: 'access-control',
      sourceDeviceId: rawEvent.door_id || rawEvent.device_id,
      eventType: eventTypeMap[rawEvent.event_type] || rawEvent.event_type,
      occurredAt: new Date(rawEvent.timestamp || rawEvent.occurred_at),
      severity: severityMap[rawEvent.event_type] || 'info',
      subject: {
        credentialId: rawEvent.credential_id,
        employeeId: rawEvent.employee_id,
        accessMethod: rawEvent.access_method,
        direction: rawEvent.direction
      },
      metadata: {
        doorName: rawEvent.door_name,
        controllerI d: rawEvent.controller_id,
        accessGroup: rawEvent.access_group,
        schedule: rawEvent.schedule,
        reasonCode: rawEvent.reason_code,
        doorState: rawEvent.door_state
      },
      rawPayload: rawEvent
    };
  }

  private async setupWebhook(): Promise<void> {
    // Webhook setup would be done at the application level
    // This method prepares the connector to receive webhook events
    logger.info('Access Control webhook endpoint ready', {
      connectorId: this.connectorId
    });
  }

  private async setupPolling(): Promise<void> {
    const pollingIntervalSeconds = this.getConfig('pollingInterval', 60);
    
    this.pollingInterval = setInterval(async () => {
      await this.pollEvents();
    }, pollingIntervalSeconds * 1000);

    // Immediate first poll
    await this.pollEvents();
  }

  private async pollEvents(): Promise<void> {
    try {
      const endpoint = this.getConfig('eventsEndpoint');
      const response = await axios.get(endpoint, {
        headers: this.getAuthHeaders(),
        params: {
          since: this.getLastPollTime()
        }
      });

      const events = response.data.events || response.data;
      
      for (const event of events) {
        await this.handleIncomingEvent(event);
      }

      await this.updateLastPollTime();
    } catch (error) {
      logger.error('Error polling access control events', {
        connectorId: this.connectorId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private getAuthHeaders(): Record<string, string> {
    const authMethod = this.getConfig('authMethod', 'api-key');
    const headers: Record<string, string> = {};

    if (authMethod === 'api-key') {
      headers['X-API-Key'] = this.getConfig('apiKey');
    } else if (authMethod === 'bearer') {
      headers['Authorization'] = `Bearer ${this.getConfig('bearerToken')}`;
    }

    return headers;
  }

  private getLastPollTime(): string {
    // Implement persistent storage of last poll time
    return new Date(Date.now() - 300000).toISOString(); // Last 5 minutes
  }

  private async updateLastPollTime(): Promise<void> {
    // Store last poll time for next iteration
  }

  /**
   * Store access control specific event data
   */
  async storeAccessControlEvent(externalEventId: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO access_control_events 
       (external_event_id, door_id, controller_id, credential_id, employee_id,
        event_result, access_method, direction, door_state, access_group_name,
        schedule_name, reason_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        externalEventId,
        eventData.doorId,
        eventData.controllerId,
        eventData.credentialId,
        eventData.employeeId,
        eventData.eventResult,
        eventData.accessMethod,
        eventData.direction,
        eventData.doorState,
        eventData.accessGroupName,
        eventData.scheduleName,
        eventData.reasonCode
      ]
    );
  }
}
