import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { logger } from '../utils/logger';

/**
 * Integration Gateway Service
 * Central hub for receiving, normalizing, and processing external events
 */

export interface ExternalEventInput {
  eventId: string;
  connectorId: string;
  sourceSystem: string;
  sourceDeviceId?: string;
  eventType: string;
  occurredAt: Date;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
  subject?: Record<string, any>;
  metadata?: Record<string, any>;
  rawPayload: Record<string, any>;
  signature?: string;
}

export interface NormalizedEvent {
  id: string;
  eventId: string;
  connectorId: string;
  sourceSystem: string;
  sourceDeviceId?: string;
  eventType: string;
  occurredAt: Date;
  receivedAt: Date;
  branchId?: string;
  locationId?: string;
  zoneId?: string;
  severity: string;
  subjectJson: Record<string, any>;
  metadataJson: Record<string, any>;
  deliveryState: string;
  signatureVerified: boolean;
  clockOffsetSeconds?: number;
  networkDelayMs?: number;
}

export class IntegrationGatewayService extends EventEmitter {
  private pool: Pool;
  private processingQueue: Map<string, NormalizedEvent> = new Map();
  private deadLetterQueue: Map<string, any> = new Map();

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Receive and validate external event
   */
  async receiveEvent(input: ExternalEventInput): Promise<NormalizedEvent> {
    const receivedAt = new Date();
    const eventDbId = uuidv4();

    try {
      // Check for duplicate
      const existingEvent = await this.checkDuplicate(
        input.connectorId,
        input.eventId
      );

      if (existingEvent) {
        logger.warn('Duplicate event detected', {
          connectorId: input.connectorId,
          eventId: input.eventId
        });
        return existingEvent;
      }

      // Validate signature if provided
      const signatureVerified = input.signature
        ? await this.verifySignature(input)
        : false;

      // Calculate clock offset and network delay
      const clockOffsetSeconds = this.calculateClockOffset(
        input.occurredAt,
        receivedAt
      );
      const networkDelayMs = this.calculateNetworkDelay(receivedAt);

      // Create normalized event
      const normalizedEvent: NormalizedEvent = {
        id: eventDbId,
        eventId: input.eventId,
        connectorId: input.connectorId,
        sourceSystem: input.sourceSystem,
        sourceDeviceId: input.sourceDeviceId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        receivedAt,
        severity: input.severity || 'info',
        subjectJson: input.subject || {},
        metadataJson: input.metadata || {},
        deliveryState: 'received',
        signatureVerified,
        clockOffsetSeconds,
        networkDelayMs
      };

      // Store raw payload
      await this.storeRawPayload(eventDbId, input.rawPayload);

      // Validate event structure
      const validationResult = await this.validateEvent(normalizedEvent);
      if (!validationResult.valid) {
        normalizedEvent.deliveryState = 'failed';
        await this.handleValidationFailure(normalizedEvent, validationResult.errors);
        return normalizedEvent;
      }

      // Store normalized event
      await this.storeNormalizedEvent(normalizedEvent);

      // Add to processing queue
      this.processingQueue.set(eventDbId, normalizedEvent);

      // Emit event for processing
      this.emit('event:received', normalizedEvent);

      logger.info('Event received and queued', {
        eventId: normalizedEvent.eventId,
        eventType: normalizedEvent.eventType,
        connectorId: normalizedEvent.connectorId
      });

      return normalizedEvent;
    } catch (error) {
      logger.error('Error receiving event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventId: input.eventId
      });
      throw error;
    }
  }

  /**
   * Normalize event with mapping and enrichment
   */
  async normalizeEvent(event: NormalizedEvent): Promise<NormalizedEvent> {
    try {
      // Apply device/location mapping
      const mappings = await this.getMappings(event.connectorId);
      
      if (event.sourceDeviceId) {
        const deviceMapping = mappings.find(
          m => m.mappingType === 'device' && m.externalId === event.sourceDeviceId
        );
        
        if (deviceMapping) {
          event.branchId = deviceMapping.branchId;
          event.locationId = deviceMapping.locationId;
          event.zoneId = deviceMapping.zoneId;
        }
      }

      event.deliveryState = 'normalized';
      await this.updateEventState(event.id, 'normalized');

      this.emit('event:normalized', event);
      return event;
    } catch (error) {
      logger.error('Error normalizing event', { eventId: event.id, error });
      throw error;
    }
  }

  /**
   * Process event through rules engine
   */
  async processEvent(event: NormalizedEvent): Promise<void> {
    try {
      // Get applicable rules
      const rules = await this.getApplicableRules(event);

      for (const rule of rules) {
        if (await this.evaluateRuleCondition(rule, event)) {
          await this.executeRuleActions(rule, event);
          rule.executionCount++;
          rule.lastExecutedAt = new Date();
        }
      }

      event.deliveryState = 'processed';
      await this.updateEventState(event.id, 'processed');

      // Remove from processing queue
      this.processingQueue.delete(event.id);

      this.emit('event:processed', event);

      logger.info('Event processed successfully', {
        eventId: event.id,
        rulesApplied: rules.length
      });
    } catch (error) {
      logger.error('Error processing event', { eventId: event.id, error });
      await this.handleProcessingFailure(event, error);
    }
  }

  /**
   * Correlate events across systems and time
   */
  async correlateEvents(event: NormalizedEvent): Promise<void> {
    try {
      const correlationWindow = 300; // 5 minutes in seconds
      const timeWindowStart = new Date(event.occurredAt.getTime() - correlationWindow * 1000);
      const timeWindowEnd = new Date(event.occurredAt.getTime() + correlationWindow * 1000);

      // Find related events in time window
      const relatedEvents = await this.findRelatedEvents(
        event,
        timeWindowStart,
        timeWindowEnd
      );

      if (relatedEvents.length > 0) {
        const correlationId = uuidv4();
        
        // Create correlation
        await this.createCorrelation({
          correlationId,
          correlationType: 'temporal',
          primaryEventId: event.id,
          timeWindowStart,
          timeWindowEnd,
          branchId: event.branchId,
          confidenceScore: this.calculateCorrelationConfidence(event, relatedEvents)
        });

        // Link related events
        for (const relatedEvent of relatedEvents) {
          await this.linkEventToCorrelation(correlationId, relatedEvent.id);
        }

        // Determine if incident should be created
        if (await this.shouldCreateIncident(event, relatedEvents)) {
          await this.createCorrelatedIncident(correlationId, event, relatedEvents);
        }

        logger.info('Events correlated', {
          correlationId,
          primaryEventId: event.id,
          relatedEventsCount: relatedEvents.length
        });
      }
    } catch (error) {
      logger.error('Error correlating events', { eventId: event.id, error });
    }
  }

  /**
   * Retry failed event processing
   */
  async retryEvent(eventId: string, retryAttempt: number): Promise<boolean> {
    try {
      const event = await this.getEventById(eventId);
      if (!event) {
        logger.error('Event not found for retry', { eventId });
        return false;
      }

      // Check retry limits
      const retryConfig = await this.getRetryConfig(event.connectorId);
      if (retryAttempt >= retryConfig.maxRetries) {
        logger.warn('Max retries exceeded, moving to dead letter queue', { eventId });
        await this.moveToDeadLetterQueue(event, 'max_retries_exceeded');
        return false;
      }

      // Calculate backoff delay
      const delay = retryConfig.initialDelayMs * Math.pow(retryConfig.backoffMultiplier, retryAttempt);
      
      logger.info('Scheduling event retry', {
        eventId,
        retryAttempt,
        delayMs: delay
      });

      setTimeout(async () => {
        try {
          await this.processEvent(event);
          await this.recordRetrySuccess(eventId, retryAttempt);
        } catch (error) {
          await this.recordRetryFailure(eventId, retryAttempt, error);
          await this.retryEvent(eventId, retryAttempt + 1);
        }
      }, delay);

      return true;
    } catch (error) {
      logger.error('Error retrying event', { eventId, error });
      return false;
    }
  }

  // Helper methods

  private async checkDuplicate(
    connectorId: string,
    eventId: string
  ): Promise<NormalizedEvent | null> {
    const result = await this.pool.query(
      `SELECT * FROM external_events WHERE connector_id = $1 AND event_id = $2`,
      [connectorId, eventId]
    );
    return result.rows[0] || null;
  }

  private async verifySignature(input: ExternalEventInput): Promise<boolean> {
    // Implementation depends on connector-specific signature verification
    // This is a placeholder that should be implemented based on specific needs
    return true;
  }

  private calculateClockOffset(eventTime: Date, receivedTime: Date): number {
    return (receivedTime.getTime() - eventTime.getTime()) / 1000;
  }

  private calculateNetworkDelay(receivedTime: Date): number {
    // Simplified calculation, actual implementation may vary
    return 50; // milliseconds
  }

  private async storeRawPayload(eventId: string, payload: Record<string, any>): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_event_payloads 
       (external_event_id, raw_payload, content_type, payload_size_bytes)
       VALUES ($1, $2, $3, $4)`,
      [eventId, JSON.stringify(payload), 'application/json', JSON.stringify(payload).length]
    );
  }

  private async validateEvent(event: NormalizedEvent): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!event.eventType) {
      errors.push('Event type is required');
    }

    if (!event.sourceSystem) {
      errors.push('Source system is required');
    }

    if (!event.occurredAt) {
      errors.push('Event occurrence time is required');
    }

    return { valid: errors.length === 0, errors };
  }

  private async storeNormalizedEvent(event: NormalizedEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_events 
       (id, event_id, connector_id, source_system, source_device_id, event_type,
        occurred_at, received_at, branch_id, location_id, zone_id, severity,
        subject_json, metadata_json, delivery_state, signature_verified,
        clock_offset_seconds, network_delay_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        event.id, event.eventId, event.connectorId, event.sourceSystem,
        event.sourceDeviceId, event.eventType, event.occurredAt, event.receivedAt,
        event.branchId, event.locationId, event.zoneId, event.severity,
        JSON.stringify(event.subjectJson), JSON.stringify(event.metadataJson),
        event.deliveryState, event.signatureVerified,
        event.clockOffsetSeconds, event.networkDelayMs
      ]
    );
  }

  private async updateEventState(eventId: string, state: string): Promise<void> {
    await this.pool.query(
      `UPDATE external_events SET delivery_state = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [state, eventId]
    );
  }

  private async handleValidationFailure(event: NormalizedEvent, errors: string[]): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_event_failures 
       (external_event_id, failure_type, error_message, error_details_json)
       VALUES ($1, $2, $3, $4)`,
      [event.id, 'validation', errors.join('; '), JSON.stringify({ errors })]
    );

    this.emit('event:validation-failed', { event, errors });
  }

  private async handleProcessingFailure(event: NormalizedEvent, error: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_event_failures 
       (external_event_id, failure_type, error_message, stack_trace, next_retry_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.id,
        'processing',
        error.message,
        error.stack,
        new Date(Date.now() + 60000) // retry in 1 minute
      ]
    );

    await this.retryEvent(event.id, 1);
  }

  private async getMappings(connectorId: string): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM integration_mappings WHERE connector_id = $1 AND is_active = true`,
      [connectorId]
    );
    return result.rows;
  }

  private async getApplicableRules(event: NormalizedEvent): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT * FROM integration_rules 
       WHERE (connector_id = $1 OR connector_id IS NULL)
       AND is_active = true
       ORDER BY priority ASC`,
      [event.connectorId]
    );
    return result.rows;
  }

  private async evaluateRuleCondition(rule: any, event: NormalizedEvent): Promise<boolean> {
    const condition = rule.conditionJson;

    // Simple rule evaluation - can be extended with a proper rules engine
    if (condition.eventType && condition.eventType !== event.eventType) {
      return false;
    }

    if (condition.severity && condition.severity !== event.severity) {
      return false;
    }

    if (condition.branchId && condition.branchId !== event.branchId) {
      return false;
    }

    return true;
  }

  private async executeRuleActions(rule: any, event: NormalizedEvent): Promise<void> {
    const actions = rule.actionJson;

    for (const action of actions) {
      switch (action.type) {
        case 'create-alert':
          await this.createAlert(event, action.params);
          break;
        case 'create-incident':
          await this.createIncident(event, action.params);
          break;
        case 'preserve-video':
          await this.preserveVideo(event, action.params);
          break;
        case 'send-notification':
          await this.sendNotification(event, action.params);
          break;
        case 'open-cameras':
          await this.openCameras(event, action.params);
          break;
      }
    }
  }

  private async createAlert(event: NormalizedEvent, params: any): Promise<void> {
    // Integration with alert system
    logger.info('Creating alert from external event', { eventId: event.id, params });
  }

  private async createIncident(event: NormalizedEvent, params: any): Promise<void> {
    // Integration with incident system
    logger.info('Creating incident from external event', { eventId: event.id, params });
  }

  private async preserveVideo(event: NormalizedEvent, params: any): Promise<void> {
    // Integration with video preservation
    logger.info('Preserving video for external event', { eventId: event.id, params });
  }

  private async sendNotification(event: NormalizedEvent, params: any): Promise<void> {
    // Integration with notification system
    logger.info('Sending notification for external event', { eventId: event.id, params });
  }

  private async openCameras(event: NormalizedEvent, params: any): Promise<void> {
    // Integration with camera system
    logger.info('Opening cameras for external event', { eventId: event.id, params });
  }

  private async findRelatedEvents(
    event: NormalizedEvent,
    timeWindowStart: Date,
    timeWindowEnd: Date
  ): Promise<NormalizedEvent[]> {
    const result = await this.pool.query(
      `SELECT * FROM external_events
       WHERE id != $1
       AND branch_id = $2
       AND occurred_at BETWEEN $3 AND $4
       AND delivery_state = 'processed'
       ORDER BY occurred_at DESC`,
      [event.id, event.branchId, timeWindowStart, timeWindowEnd]
    );
    return result.rows;
  }

  private calculateCorrelationConfidence(
    event: NormalizedEvent,
    relatedEvents: NormalizedEvent[]
  ): number {
    let confidence = 50; // base confidence

    // Same branch
    if (relatedEvents.some(e => e.branchId === event.branchId)) {
      confidence += 20;
    }

    // Same zone
    if (relatedEvents.some(e => e.zoneId === event.zoneId)) {
      confidence += 15;
    }

    // Close time proximity (within 30 seconds)
    const closeTimeEvents = relatedEvents.filter(e => 
      Math.abs(e.occurredAt.getTime() - event.occurredAt.getTime()) < 30000
    );
    if (closeTimeEvents.length > 0) {
      confidence += 15;
    }

    return Math.min(confidence, 100);
  }

  private async createCorrelation(correlationData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO event_correlations 
       (correlation_id, correlation_type, primary_event_id, time_window_start, 
        time_window_end, branch_id, confidence_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        correlationData.correlationId,
        correlationData.correlationType,
        correlationData.primaryEventId,
        correlationData.timeWindowStart,
        correlationData.timeWindowEnd,
        correlationData.branchId,
        correlationData.confidenceScore
      ]
    );
  }

  private async linkEventToCorrelation(correlationId: string, eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE external_events SET correlation_id = $1 WHERE id = $2`,
      [correlationId, eventId]
    );
  }

  private async shouldCreateIncident(
    event: NormalizedEvent,
    relatedEvents: NormalizedEvent[]
  ): Promise<boolean> {
    // Incident creation logic based on correlation
    if (event.severity === 'critical') {
      return true;
    }

    if (event.severity === 'high' && relatedEvents.length >= 2) {
      return true;
    }

    return false;
  }

  private async createCorrelatedIncident(
    correlationId: string,
    primaryEvent: NormalizedEvent,
    relatedEvents: NormalizedEvent[]
  ): Promise<void> {
    // Create incident and link events
    logger.info('Creating correlated incident', {
      correlationId,
      primaryEventId: primaryEvent.id,
      relatedEventsCount: relatedEvents.length
    });
  }

  private async getRetryConfig(connectorId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT retry_config_json FROM integration_connectors WHERE id = $1`,
      [connectorId]
    );
    
    return result.rows[0]?.retry_config_json || {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000
    };
  }

  private async moveToDeadLetterQueue(event: NormalizedEvent, reason: string): Promise<void> {
    event.deliveryState = 'quarantined';
    await this.updateEventState(event.id, 'quarantined');
    
    this.deadLetterQueue.set(event.id, { event, reason, quarantinedAt: new Date() });
    
    logger.warn('Event moved to dead letter queue', {
      eventId: event.id,
      reason
    });
  }

  private async recordRetrySuccess(eventId: string, retryAttempt: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_event_retries (external_event_id, retry_attempt, result)
       VALUES ($1, $2, $3)`,
      [eventId, retryAttempt, 'success']
    );
  }

  private async recordRetryFailure(eventId: string, retryAttempt: number, error: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO external_event_retries (external_event_id, retry_attempt, result, error_message)
       VALUES ($1, $2, $3, $4)`,
      [eventId, retryAttempt, 'failed', error.message]
    );
  }

  private async getEventById(eventId: string): Promise<NormalizedEvent | null> {
    const result = await this.pool.query(
      `SELECT * FROM external_events WHERE id = $1`,
      [eventId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get integration health status
   */
  async getIntegrationHealth(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        ic.id,
        ic.name,
        ic.connector_type,
        ic.status,
        ic.last_health_check_at,
        ic.last_successful_event_at,
        ic.events_received_count,
        ic.events_failed_count,
        ic.average_latency_ms
      FROM integration_connectors ic
      ORDER BY ic.name
    `);

    return result.rows.map(connector => ({
      ...connector,
      queueDepth: this.getQueueDepth(connector.id),
      health: this.calculateHealthStatus(connector)
    }));
  }

  private getQueueDepth(connectorId: string): number {
    return Array.from(this.processingQueue.values())
      .filter(event => event.connectorId === connectorId)
      .length;
  }

  private calculateHealthStatus(connector: any): string {
    if (connector.status === 'inactive') return 'inactive';
    if (connector.status === 'error') return 'error';
    
    const lastEvent = connector.last_successful_event_at;
    if (!lastEvent) return 'warning';
    
    const timeSinceLastEvent = Date.now() - new Date(lastEvent).getTime();
    const thirtyMinutes = 30 * 60 * 1000;
    
    if (timeSinceLastEvent > thirtyMinutes) return 'warning';
    
    return 'healthy';
  }
}
