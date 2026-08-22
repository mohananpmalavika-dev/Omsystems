import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import { ExternalEventInput } from '../integration-gateway.service';

/**
 * Base class for all integration connectors
 */
export abstract class BaseConnector extends EventEmitter {
  protected pool: Pool;
  protected connectorId: string;
  protected connectorType: string;
  protected config: Record<string, any>;
  protected isConnected: boolean = false;

  constructor(pool: Pool, connectorId: string, connectorType: string, config: Record<string, any>) {
    super();
    this.pool = pool;
    this.connectorId = connectorId;
    this.connectorType = connectorType;
    this.config = config;
  }

  /**
   * Initialize connector and establish connection
   */
  abstract async connect(): Promise<void>;

  /**
   * Disconnect and cleanup resources
   */
  abstract async disconnect(): Promise<void>;

  /**
   * Perform health check
   */
  abstract async healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /**
   * Normalize external event to common format
   */
  protected abstract normalizeEvent(rawEvent: any): ExternalEventInput;

  /**
   * Handle incoming event from external system
   */
  protected async handleIncomingEvent(rawEvent: any): Promise<void> {
    try {
      const normalizedEvent = this.normalizeEvent(rawEvent);
      
      // Emit event for gateway to process
      this.emit('event', normalizedEvent);

      // Update connector statistics
      await this.updateStatistics('received');

      logger.debug('Event received from connector', {
        connectorId: this.connectorId,
        eventType: normalizedEvent.eventType
      });
    } catch (error) {
      logger.error('Error handling incoming event', {
        connectorId: this.connectorId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      await this.updateStatistics('failed');
      throw error;
    }
  }

  /**
   * Update connector statistics
   */
  protected async updateStatistics(type: 'received' | 'failed'): Promise<void> {
    const column = type === 'received' ? 'events_received_count' : 'events_failed_count';
    
    await this.pool.query(
      `UPDATE integration_connectors 
       SET ${column} = ${column} + 1,
           last_successful_event_at = CASE WHEN $1 = 'received' THEN CURRENT_TIMESTAMP ELSE last_successful_event_at END
       WHERE id = $2`,
      [type, this.connectorId]
    );
  }

  /**
   * Record health check result
   */
  protected async recordHealthCheck(
    status: 'healthy' | 'warning' | 'error' | 'unreachable',
    responseTimeMs?: number,
    errorMessage?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO integration_health_checks 
       (connector_id, status, response_time_ms, error_message)
       VALUES ($1, $2, $3, $4)`,
      [this.connectorId, status, responseTimeMs, errorMessage]
    );

    await this.pool.query(
      `UPDATE integration_connectors 
       SET status = $1, last_health_check_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [status === 'healthy' ? 'active' : 'error', this.connectorId]
    );
  }

  /**
   * Get connector configuration value
   */
  protected getConfig<T>(key: string, defaultValue?: T): T {
    return this.config[key] !== undefined ? this.config[key] : defaultValue!;
  }

  /**
   * Verify webhook signature
   */
  protected verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return signature === expectedSignature;
  }
}
