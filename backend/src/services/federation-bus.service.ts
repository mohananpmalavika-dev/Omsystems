/**
 * Federation Bus Service
 * Event-driven federation bus for reliable multi-control-center synchronization
 * Implements outbox/inbox pattern for guaranteed delivery
 */

import { EventEmitter } from 'events';
import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';

export interface FederationEvent {
  event_id: string;
  origin_server: string;
  sequence_number: bigint;
  tenant_id: string;
  timestamp: Date;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  schema_version: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
  checksum: string;
  correlation_id?: string;
  causation_id?: string;
}

export interface OutboxEntry {
  id: string;
  event: FederationEvent;
  target_servers: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retry_count: number;
  max_retries: number;
  next_retry_at?: Date;
  created_at: Date;
  processed_at?: Date;
}

export interface InboxEntry {
  id: string;
  event: FederationEvent;
  source_server: string;
  status: 'received' | 'processing' | 'applied' | 'duplicate' | 'failed';
  idempotency_key: string;
  received_at: Date;
  processed_at?: Date;
  error_message?: string;
}

export interface EventSubscription {
  subscriber_id: string;
  event_types: string[];
  filter_expression?: string;
  callback: (event: FederationEvent) => Promise<void>;
}

/**
 * Federation Bus - Core event distribution system
 */
export class FederationBusService extends EventEmitter {
  private pool: Pool;
  private localServerId: string;
  private sequenceCounter: bigint = 0n;
  private outboxProcessor?: NodeJS.Timeout;
  private inboxProcessor?: NodeJS.Timeout;
  private subscriptions: Map<string, EventSubscription> = new Map();
  
  private readonly OUTBOX_INTERVAL_MS = 2000; // 2 seconds
  private readonly INBOX_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_RETRIES = 5;
  private readonly BATCH_SIZE = 100;

  constructor(pool: Pool, localServerId: string) {
    super();
    this.pool = pool;
    this.localServerId = localServerId;
  }

  /**
   * Start federation bus
   */
  async start(): Promise<void> {
    logger.info('Starting Federation Bus Service', { serverId: this.localServerId });

    // Initialize sequence counter
    await this.initializeSequenceCounter();

    // Start outbox processor (publishes local events to remote servers)
    this.outboxProcessor = setInterval(async () => {
      try {
        await this.processOutbox();
      } catch (error) {
        logger.error('Outbox processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.OUTBOX_INTERVAL_MS);

    // Start inbox processor (applies remote events locally)
    this.inboxProcessor = setInterval(async () => {
      try {
        await this.processInbox();
      } catch (error) {
        logger.error('Inbox processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.INBOX_INTERVAL_MS);

    logger.info('Federation Bus Service started');
  }

  /**
   * Stop federation bus
   */
  async stop(): Promise<void> {
    if (this.outboxProcessor) {
      clearInterval(this.outboxProcessor);
    }
    if (this.inboxProcessor) {
      clearInterval(this.inboxProcessor);
    }
    logger.info('Federation Bus Service stopped');
  }

  /**
   * Publish event to federation bus
   */
  async publishEvent(
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>,
    options?: {
      targetServers?: string[]; // If not specified, broadcasts to all federated servers
      metadata?: Record<string, any>;
      correlationId?: string;
      causationId?: string;
    }
  ): Promise<FederationEvent> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate event
      const event = await this.createEvent(
        tenantId,
        eventType,
        aggregateType,
        aggregateId,
        payload,
        options
      );

      // Store in event log (immutable append-only log)
      await this.appendToEventLog(client, event);

      // Add to outbox for distribution
      await this.addToOutbox(client, event, options?.targetServers);

      // Emit locally for immediate processing
      this.emitToLocalSubscribers(event);

      await client.query('COMMIT');

      logger.debug('Event published to federation bus', {
        eventId: event.event_id,
        eventType: event.event_type,
        aggregateId: event.aggregate_id
      });

      return event;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    subscriberId: string,
    eventTypes: string[],
    callback: (event: FederationEvent) => Promise<void>,
    filterExpression?: string
  ): void {
    this.subscriptions.set(subscriberId, {
      subscriber_id: subscriberId,
      event_types: eventTypes,
      filter_expression: filterExpression,
      callback
    });

    logger.info('Event subscription registered', {
      subscriberId,
      eventTypes
    });
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriberId: string): void {
    this.subscriptions.delete(subscriberId);
  }

  /**
   * Receive event from remote server (inbox endpoint)
   */
  async receiveEvent(event: FederationEvent, sourceServerId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(event);

      // Check for duplicates
      const duplicate = await this.checkDuplicate(client, idempotencyKey);
      
      if (duplicate) {
        logger.debug('Duplicate event received, skipping', {
          eventId: event.event_id,
          idempotencyKey
        });
        await client.query('COMMIT');
        return;
      }

      // Verify event integrity
      if (!this.verifyChecksum(event)) {
        throw new Error('Event checksum verification failed');
      }

      // Store in inbox
      await client.query(
        `INSERT INTO federation_event_inbox (
          event_id, source_server, event_data, idempotency_key, status
        ) VALUES ($1, $2, $3, $4, 'received')`,
        [event.event_id, sourceServerId, JSON.stringify(event), idempotencyKey]
      );

      await client.query('COMMIT');

      logger.debug('Event received in inbox', {
        eventId: event.event_id,
        sourceServer: sourceServerId
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get event by ID from event log
   */
  async getEvent(eventId: string): Promise<FederationEvent | null> {
    const result = await this.pool.query(
      `SELECT event_data
       FROM federation_event_log
       WHERE event_id = $1`,
      [eventId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].event_data as FederationEvent;
  }

  /**
   * Query events from log
   */
  async queryEvents(filters: {
    tenantId?: string;
    eventTypes?: string[];
    aggregateType?: string;
    aggregateId?: string;
    fromSequence?: bigint;
    toSequence?: bigint;
    fromTimestamp?: Date;
    toTimestamp?: Date;
    limit?: number;
  }): Promise<FederationEvent[]> {
    let query = `
      SELECT event_data
      FROM federation_event_log
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (filters.tenantId) {
      query += ` AND tenant_id = $${paramIndex++}::uuid`;
      params.push(filters.tenantId);
    }

    if (filters.eventTypes && filters.eventTypes.length > 0) {
      query += ` AND event_type = ANY($${paramIndex++}::text[])`;
      params.push(filters.eventTypes);
    }

    if (filters.aggregateType) {
      query += ` AND aggregate_type = $${paramIndex++}`;
      params.push(filters.aggregateType);
    }

    if (filters.aggregateId) {
      query += ` AND aggregate_id = $${paramIndex++}::uuid`;
      params.push(filters.aggregateId);
    }

    if (filters.fromSequence !== undefined) {
      query += ` AND sequence_number >= $${paramIndex++}`;
      params.push(filters.fromSequence.toString());
    }

    if (filters.toSequence !== undefined) {
      query += ` AND sequence_number <= $${paramIndex++}`;
      params.push(filters.toSequence.toString());
    }

    if (filters.fromTimestamp) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.fromTimestamp);
    }

    if (filters.toTimestamp) {
      query += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.toTimestamp);
    }

    query += ` ORDER BY sequence_number DESC LIMIT $${paramIndex}`;
    params.push(filters.limit || 100);

    const result = await this.pool.query(query, params);
    return result.rows.map(row => row.event_data);
  }

  /**
   * Get current sequence position for server
   */
  async getSequencePosition(serverId?: string): Promise<bigint> {
    const targetServerId = serverId || this.localServerId;

    const result = await this.pool.query(
      `SELECT MAX(sequence_number) as max_seq
       FROM federation_event_log
       WHERE origin_server = $1`,
      [targetServerId]
    );

    return result.rows[0]?.max_seq ? BigInt(result.rows[0].max_seq) : 0n;
  }

  /**
   * Synchronize from remote server (pull missing events)
   */
  async syncFromServer(
    remoteServerId: string,
    remoteServerUrl: string,
    fromSequence?: bigint
  ): Promise<number> {
    try {
      // Get last known sequence for remote server
      const lastSequence = fromSequence || await this.getLastReceivedSequence(remoteServerId);

      // Request events from remote server
      const response = await fetch(`${remoteServerUrl}/v1/federation/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Local-Server-Id': this.localServerId
        },
        body: JSON.stringify({
          fromSequence: lastSequence.toString(),
          limit: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch events: HTTP ${response.status}`);
      }

      const data = await response.json();
      const events: FederationEvent[] = data.events || [];

      // Process received events
      for (const event of events) {
        await this.receiveEvent(event, remoteServerId);
      }

      logger.info('Synchronized events from remote server', {
        remoteServerId,
        eventCount: events.length,
        fromSequence: lastSequence.toString()
      });

      return events.length;

    } catch (error) {
      logger.error('Failed to sync from remote server', {
        remoteServerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create federation event
   */
  private async createEvent(
    tenantId: string,
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>,
    options?: {
      metadata?: Record<string, any>;
      correlationId?: string;
      causationId?: string;
    }
  ): Promise<FederationEvent> {
    const sequenceNumber = await this.getNextSequence();
    const timestamp = new Date();

    const event: FederationEvent = {
      event_id: this.generateEventId(),
      origin_server: this.localServerId,
      sequence_number: sequenceNumber,
      tenant_id: tenantId,
      timestamp,
      event_type: eventType,
      aggregate_type: aggregateType,
      aggregate_id: aggregateId,
      schema_version: '1.0',
      payload,
      metadata: options?.metadata,
      checksum: '', // Will be calculated
      correlation_id: options?.correlationId,
      causation_id: options?.causationId
    };

    // Calculate checksum
    event.checksum = this.calculateChecksum(event);

    return event;
  }

  /**
   * Append event to immutable log
   */
  private async appendToEventLog(
    client: PoolClient,
    event: FederationEvent
  ): Promise<void> {
    await client.query(
      `INSERT INTO federation_event_log (
        event_id, origin_server, sequence_number, tenant_id,
        timestamp, event_type, aggregate_type, aggregate_id,
        schema_version, checksum, event_data
      ) VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8::uuid, $9, $10, $11)`,
      [
        event.event_id,
        event.origin_server,
        event.sequence_number.toString(),
        event.tenant_id,
        event.timestamp,
        event.event_type,
        event.aggregate_type,
        event.aggregate_id,
        event.schema_version,
        event.checksum,
        JSON.stringify(event)
      ]
    );
  }

  /**
   * Add event to outbox for distribution
   */
  private async addToOutbox(
    client: PoolClient,
    event: FederationEvent,
    targetServers?: string[]
  ): Promise<void> {
    // If no target servers specified, get all federated servers
    let servers = targetServers;
    
    if (!servers || servers.length === 0) {
      const result = await client.query(
        `SELECT id::text
         FROM federated_servers
         WHERE tenant_id = $1::uuid
           AND id::text != $2
           AND sync_enabled = true
           AND status IN ('online', 'degraded')`,
        [event.tenant_id, this.localServerId]
      );
      
      servers = result.rows.map(row => row.id);
    }

    if (servers.length === 0) {
      return; // No targets to distribute to
    }

    await client.query(
      `INSERT INTO federation_event_outbox (
        event_id, event_data, target_servers, status, max_retries
      ) VALUES ($1, $2, $3, 'pending', $4)`,
      [
        event.event_id,
        JSON.stringify(event),
        servers,
        this.MAX_RETRIES
      ]
    );
  }

  /**
   * Process outbox (publish events to remote servers)
   */
  private async processOutbox(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get pending outbox entries
      const result = await client.query(
        `SELECT 
          id, event_id, event_data, target_servers, retry_count
         FROM federation_event_outbox
         WHERE status = 'pending'
           OR (status = 'failed' AND retry_count < max_retries AND next_retry_at < now())
         ORDER BY created_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [this.BATCH_SIZE]
      );

      for (const row of result.rows) {
        await this.publishToRemoteServers(
          client,
          row.id,
          row.event_data,
          row.target_servers,
          row.retry_count
        );
      }

    } finally {
      client.release();
    }
  }

  /**
   * Publish event to remote servers
   */
  private async publishToRemoteServers(
    client: PoolClient,
    outboxId: string,
    event: FederationEvent,
    targetServers: string[],
    retryCount: number
  ): Promise<void> {
    const successfulServers: string[] = [];
    const failedServers: string[] = [];

    for (const serverId of targetServers) {
      try {
        // Get server details
        const serverResult = await client.query(
          `SELECT api_url FROM federated_servers WHERE id = $1::uuid`,
          [serverId]
        );

        if (serverResult.rows.length === 0) {
          continue;
        }

        const apiUrl = serverResult.rows[0].api_url;

        // Send event to remote server
        const response = await fetch(`${apiUrl}/v1/federation/events/receive`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Source-Server-Id': this.localServerId
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          successfulServers.push(serverId);
        } else {
          failedServers.push(serverId);
        }

      } catch (error) {
        failedServers.push(serverId);
        logger.warn('Failed to publish event to server', {
          serverId,
          eventId: event.event_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Update outbox entry
    if (failedServers.length === 0) {
      // All successful
      await client.query(
        `UPDATE federation_event_outbox
         SET status = 'completed',
             processed_at = now()
         WHERE id = $1`,
        [outboxId]
      );
    } else if (successfulServers.length > 0) {
      // Partial success - update target servers to only failed ones
      await client.query(
        `UPDATE federation_event_outbox
         SET target_servers = $2,
             retry_count = retry_count + 1,
             next_retry_at = now() + interval '30 seconds',
             status = CASE 
               WHEN retry_count + 1 >= max_retries THEN 'failed'
               ELSE 'pending'
             END
         WHERE id = $1`,
        [outboxId, failedServers]
      );
    } else {
      // All failed
      await client.query(
        `UPDATE federation_event_outbox
         SET retry_count = retry_count + 1,
             next_retry_at = now() + interval '30 seconds',
             status = CASE 
               WHEN retry_count + 1 >= max_retries THEN 'failed'
               ELSE 'pending'
             END
         WHERE id = $1`,
        [outboxId]
      );
    }
  }

  /**
   * Process inbox (apply received events)
   */
  private async processInbox(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get received events
      const result = await client.query(
        `SELECT 
          id, event_id, event_data, source_server
         FROM federation_event_inbox
         WHERE status = 'received'
         ORDER BY received_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [this.BATCH_SIZE]
      );

      for (const row of result.rows) {
        await this.applyInboxEvent(client, row.id, row.event_data, row.source_server);
      }

    } finally {
      client.release();
    }
  }

  /**
   * Apply inbox event
   */
  private async applyInboxEvent(
    client: PoolClient,
    inboxId: string,
    event: FederationEvent,
    sourceServer: string
  ): Promise<void> {
    try {
      // Mark as processing
      await client.query(
        `UPDATE federation_event_inbox
         SET status = 'processing'
         WHERE id = $1`,
        [inboxId]
      );

      // Emit to local subscribers
      await this.emitToLocalSubscribers(event);

      // Mark as applied
      await client.query(
        `UPDATE federation_event_inbox
         SET status = 'applied',
             processed_at = now()
         WHERE id = $1`,
        [inboxId]
      );

      logger.debug('Inbox event applied', {
        eventId: event.event_id,
        sourceServer
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await client.query(
        `UPDATE federation_event_inbox
         SET status = 'failed',
             error_message = $2
         WHERE id = $1`,
        [inboxId, errorMessage]
      );

      logger.error('Failed to apply inbox event', {
        eventId: event.event_id,
        error: errorMessage
      });
    }
  }

  /**
   * Emit event to local subscribers
   */
  private async emitToLocalSubscribers(event: FederationEvent): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      // Check if event type matches
      if (!subscription.event_types.includes('*') &&
          !subscription.event_types.includes(event.event_type)) {
        continue;
      }

      try {
        await subscription.callback(event);
      } catch (error) {
        logger.error('Subscription callback failed', {
          subscriberId: subscription.subscriber_id,
          eventId: event.event_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Also emit as Node.js event
    this.emit('event', event);
    this.emit(event.event_type, event);
  }

  /**
   * Initialize sequence counter
   */
  private async initializeSequenceCounter(): Promise<void> {
    this.sequenceCounter = await this.getSequencePosition();
  }

  /**
   * Get next sequence number
   */
  private async getNextSequence(): Promise<bigint> {
    this.sequenceCounter += 1n;
    return this.sequenceCounter;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `${this.localServerId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate event checksum
   */
  private calculateChecksum(event: FederationEvent): string {
    const data = {
      event_id: event.event_id,
      origin_server: event.origin_server,
      sequence_number: event.sequence_number.toString(),
      tenant_id: event.tenant_id,
      timestamp: event.timestamp.toISOString(),
      event_type: event.event_type,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      payload: event.payload
    };

    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  /**
   * Verify event checksum
   */
  private verifyChecksum(event: FederationEvent): boolean {
    const expectedChecksum = this.calculateChecksum(event);
    return event.checksum === expectedChecksum;
  }

  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(event: FederationEvent): string {
    return `${event.origin_server}:${event.event_id}:${event.sequence_number}`;
  }

  /**
   * Check for duplicate event
   */
  private async checkDuplicate(
    client: PoolClient,
    idempotencyKey: string
  ): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM federation_event_inbox WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );

    return result.rows.length > 0;
  }

  /**
   * Get last received sequence from remote server
   */
  private async getLastReceivedSequence(remoteServerId: string): Promise<bigint> {
    const result = await this.pool.query(
      `SELECT MAX((event_data->>'sequence_number')::bigint) as max_seq
       FROM federation_event_inbox
       WHERE source_server = $1
         AND status IN ('applied', 'processing')`,
      [remoteServerId]
    );

    return result.rows[0]?.max_seq ? BigInt(result.rows[0].max_seq) : 0n;
  }
}

// Singleton instance
let federationBusInstance: FederationBusService | null = null;

export function getFederationBus(pool: Pool, localServerId: string): FederationBusService {
  if (!federationBusInstance) {
    federationBusInstance = new FederationBusService(pool, localServerId);
  }
  return federationBusInstance;
}
