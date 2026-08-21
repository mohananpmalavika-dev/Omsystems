/**
 * Integration Manager
 * 
 * Manages integration lifecycle, event routing, retry logic, and error handling.
 */

import { Pool } from 'pg';
import type {
  IntegrationConfig,
  IntegrationEvent,
  IntegrationResponse,
  IntegrationEventType,
  IntegrationType,
  WebhookDelivery
} from './types.js';
import { connectorRegistry } from './connector-registry.js';
import { randomUUID } from 'node:crypto';

export class IntegrationManager {
  private eventQueue: IntegrationEvent[] = [];
  private processing = false;

  constructor(private pool: Pool) {}

  /**
   * Create a new integration configuration
   */
  async createIntegration(config: Omit<IntegrationConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<IntegrationConfig> {
    const id = randomUUID();
    const now = new Date();

    const query = `
      INSERT INTO integration_configs (
        id, tenant_id, name, type, category, status, enabled,
        config, credentials, subscribed_events,
        retry_config, rate_limit_config,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      id,
      config.tenantId,
      config.name,
      config.type,
      config.category,
      config.status,
      config.enabled,
      JSON.stringify(config.config),
      JSON.stringify(config.credentials),
      JSON.stringify(config.subscribedEvents),
      config.retryConfig ? JSON.stringify(config.retryConfig) : null,
      config.rateLimitConfig ? JSON.stringify(config.rateLimitConfig) : null,
      now,
      now
    ]);

    const saved = this.mapRowToConfig(result.rows[0]);

    // Initialize connector if enabled
    if (saved.enabled) {
      await connectorRegistry.initializeConnector(saved);
    }

    return saved;
  }

  /**
   * Update integration configuration
   */
  async updateIntegration(id: string, updates: Partial<IntegrationConfig>): Promise<IntegrationConfig> {
    const current = await this.getIntegration(id);
    if (!current) {
      throw new Error(`Integration not found: ${id}`);
    }

    const query = `
      UPDATE integration_configs
      SET
        name = COALESCE($2, name),
        status = COALESCE($3, status),
        enabled = COALESCE($4, enabled),
        config = COALESCE($5, config),
        credentials = COALESCE($6, credentials),
        subscribed_events = COALESCE($7, subscribed_events),
        retry_config = COALESCE($8, retry_config),
        rate_limit_config = COALESCE($9, rate_limit_config),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      id,
      updates.name,
      updates.status,
      updates.enabled,
      updates.config ? JSON.stringify(updates.config) : null,
      updates.credentials ? JSON.stringify(updates.credentials) : null,
      updates.subscribedEvents ? JSON.stringify(updates.subscribedEvents) : null,
      updates.retryConfig ? JSON.stringify(updates.retryConfig) : null,
      updates.rateLimitConfig ? JSON.stringify(updates.rateLimitConfig) : null
    ]);

    const updated = this.mapRowToConfig(result.rows[0]);

    // Reinitialize if enabled state changed
    if (current.enabled !== updated.enabled) {
      if (updated.enabled) {
        await connectorRegistry.initializeConnector(updated);
      } else {
        await connectorRegistry.destroyConnector(id);
      }
    }

    return updated;
  }

  /**
   * Delete integration configuration
   */
  async deleteIntegration(id: string): Promise<void> {
    await connectorRegistry.destroyConnector(id);
    await this.pool.query('DELETE FROM integration_configs WHERE id = $1', [id]);
  }

  /**
   * Get integration configuration
   */
  async getIntegration(id: string): Promise<IntegrationConfig | null> {
    const result = await this.pool.query(
      'SELECT * FROM integration_configs WHERE id = $1',
      [id]
    );

    return result.rows.length > 0 ? this.mapRowToConfig(result.rows[0]) : null;
  }

  /**
   * List integrations for a tenant
   */
  async listIntegrations(tenantId: string, filters?: {
    type?: IntegrationType;
    category?: string;
    enabled?: boolean;
  }): Promise<IntegrationConfig[]> {
    let query = 'SELECT * FROM integration_configs WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filters.type);
      paramIndex++;
    }

    if (filters?.category) {
      query += ` AND category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    if (filters?.enabled !== undefined) {
      query += ` AND enabled = $${paramIndex}`;
      params.push(filters.enabled);
      paramIndex++;
    }

    query += ' ORDER BY name';

    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.mapRowToConfig(row));
  }

  /**
   * Test integration connection
   */
  async testIntegration(id: string): Promise<{ success: boolean; message: string; details?: any }> {
    const config = await this.getIntegration(id);
    if (!config) {
      return { success: false, message: 'Integration not found' };
    }

    return connectorRegistry.testConnection(config);
  }

  /**
   * Publish an event to all subscribed integrations
   */
  async publishEvent(event: Omit<IntegrationEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: IntegrationEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date()
    };

    // Store event
    await this.storeEvent(fullEvent);

    // Find subscribed integrations
    const integrations = await this.getSubscribedIntegrations(
      event.tenantId,
      event.eventType
    );

    // A queued event is fanned out by deliverEvent. Enqueueing once per
    // integration would deliver N copies to each of N connectors.
    if (integrations.some((integration) => integration.enabled && integration.status === 'active')) {
      this.eventQueue.push(fullEvent);
      await this.processQueue();
    }
  }

  /**
   * Get integrations subscribed to an event type
   */
  private async getSubscribedIntegrations(
    tenantId: string,
    eventType: IntegrationEventType
  ): Promise<IntegrationConfig[]> {
    const query = `
      SELECT * FROM integration_configs
      WHERE tenant_id = $1
        AND enabled = true
        AND status = 'active'
        AND subscribed_events @> $2::jsonb
    `;

    const result = await this.pool.query(query, [
      tenantId,
      JSON.stringify([eventType])
    ]);

    return result.rows.map(row => this.mapRowToConfig(row));
  }

  /**
   * Process event queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        if (event) {
          await this.deliverEvent(event);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Deliver event to all subscribed integrations
   */
  private async deliverEvent(event: IntegrationEvent): Promise<void> {
    const integrations = await this.getSubscribedIntegrations(
      event.tenantId,
      event.eventType
    );

    const deliveries = integrations.map(integration =>
      this.deliverToIntegration(integration, event)
    );

    await Promise.allSettled(deliveries);
  }

  /**
   * Deliver event to a single integration with retry logic
   */
  private async deliverToIntegration(
    integration: IntegrationConfig,
    event: IntegrationEvent
  ): Promise<void> {
    const maxRetries = integration.retryConfig?.maxRetries ?? 3;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const response = await connectorRegistry.handleEvent(integration.id, event);
        
        // Store successful response
        await this.storeResponse(integration.id, event.id, response);
        
        // Update last success timestamp
        await this.pool.query(
          'UPDATE integration_configs SET last_success_at = NOW() WHERE id = $1',
          [integration.id]
        );

        return;
      } catch (error) {
        lastError = error as Error;
        attempt++;

        if (attempt <= maxRetries) {
          const delay = this.calculateRetryDelay(attempt, integration);
          await this.sleep(delay);
        }
      }
    }

    // Store error after all retries failed
    if (lastError) {
      await this.pool.query(
        `UPDATE integration_configs 
         SET last_error_at = NOW(), last_error = $2 
         WHERE id = $1`,
        [integration.id, lastError.message]
      );

      await this.storeResponse(integration.id, event.id, {
        success: false,
        integrationId: integration.id,
        eventId: event.id,
        timestamp: new Date(),
        error: lastError.message,
        retryCount: attempt
      });
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, integration: IntegrationConfig): number {
    const baseDelay = integration.retryConfig?.retryDelayMs ?? 1000;
    const multiplier = integration.retryConfig?.backoffMultiplier ?? 2;
    return baseDelay * Math.pow(multiplier, attempt - 1);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Store event in database
   */
  private async storeEvent(event: IntegrationEvent): Promise<void> {
    const query = `
      INSERT INTO integration_events (
        id, tenant_id, event_type, timestamp, payload,
        user_id, camera_id, branch_id, alert_id, incident_id,
        source_system, source_ip
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;

    await this.pool.query(query, [
      event.id,
      event.tenantId,
      event.eventType,
      event.timestamp,
      JSON.stringify(event.payload),
      event.userId,
      event.cameraId,
      event.branchId,
      event.alertId,
      event.incidentId,
      event.sourceSystem,
      event.sourceIp
    ]);
  }

  /**
   * Store integration response
   */
  private async storeResponse(
    integrationId: string,
    eventId: string,
    response: IntegrationResponse
  ): Promise<void> {
    const query = `
      INSERT INTO integration_responses (
        id, integration_id, event_id, timestamp,
        success, external_id, external_url, response, error, retry_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `;

    await this.pool.query(query, [
      randomUUID(),
      integrationId,
      eventId,
      response.timestamp,
      response.success,
      response.externalId,
      response.externalUrl,
      response.response ? JSON.stringify(response.response) : null,
      response.error,
      response.retryCount ?? 0
    ]);
  }

  /**
   * Map database row to IntegrationConfig
   */
  private mapRowToConfig(row: any): IntegrationConfig {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      type: row.type,
      category: row.category,
      status: row.status,
      enabled: row.enabled,
      config: row.config,
      credentials: row.credentials,
      subscribedEvents: row.subscribed_events,
      retryConfig: row.retry_config,
      rateLimitConfig: row.rate_limit_config,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastSuccessAt: row.last_success_at,
      lastErrorAt: row.last_error_at,
      lastError: row.last_error
    };
  }

  /**
   * Initialize all active integrations on startup
   */
  async initializeAllIntegrations(): Promise<void> {
    const query = 'SELECT * FROM integration_configs WHERE enabled = true';
    const result = await this.pool.query(query);

    for (const row of result.rows) {
      const config = this.mapRowToConfig(row);
      try {
        await connectorRegistry.initializeConnector(config);
      } catch (error) {
        console.error(`Failed to initialize integration ${config.id}:`, error);
      }
    }
  }
}
