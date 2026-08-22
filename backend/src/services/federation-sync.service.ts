/**
 * Federation Sync Service
 * Handles metadata replication and event synchronization between servers
 * Now powered by Federation Bus for reliable event-driven synchronization
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { getFederationManager } from './federation-manager.service.js';
import { getFederationBus, type FederationEvent } from './federation-bus.service.js';

export type SyncType = 'full' | 'incremental' | 'realtime';
export type EntityType = 'cameras' | 'alerts' | 'incidents' | 'users' | 'recordings' | 'analytics';
export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'failed' | 'conflict';

export interface SyncJob {
  id: string;
  tenantId: string;
  sourceServerId: string;
  destinationServerId: string;
  syncType: SyncType;
  entityType: EntityType;
  status: SyncStatus;
  startedAt?: Date;
  completedAt?: Date;
  totalRecords?: number;
  syncedRecords: number;
  failedRecords: number;
  durationSeconds?: number;
  errorMessage?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

export interface ReplicationQueueItem {
  id: string;
  tenantId: string;
  sourceServerId: string;
  destinationServerId: string;
  entityType: EntityType;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  processedAt?: Date;
}

export class FederationSyncService extends EventEmitter {
  private pool: Pool;
  private federationManager: ReturnType<typeof getFederationManager>;
  private federationBus: ReturnType<typeof getFederationBus>;
  private localServerId: string;
  private syncInterval?: NodeJS.Timeout;
  private readonly SYNC_INTERVAL_MS = 60000; // 1 minute
  private readonly MAX_SYNC_WORKERS = 3;
  private activeSyncJobs: Set<string> = new Set();

  constructor(pool: Pool, localServerId: string) {
    super();
    this.pool = pool;
    this.localServerId = localServerId;
    this.federationManager = getFederationManager(pool);
    this.federationBus = getFederationBus(pool, localServerId);
  }

  /**
   * Start sync service
   */
  async start(): Promise<void> {
    logger.info('Starting Federation Sync Service');

    // Start federation bus first
    await this.federationBus.start();

    // Subscribe to entity change events
    this.subscribeToEntityEvents();

    // Start periodic full sync jobs for redundancy
    this.syncInterval = setInterval(async () => {
      try {
        await this.processPendingSyncJobs();
      } catch (error) {
        logger.error('Sync job processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.SYNC_INTERVAL_MS);

    logger.info('Federation Sync Service started');
  }

  /**
   * Stop sync service
   */
  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    await this.federationBus.stop();
    
    logger.info('Federation Sync Service stopped');
  }

  /**
   * Subscribe to local entity change events and publish to federation bus
   */
  private subscribeToEntityEvents(): void {
    // Camera events
    this.on('camera:created', async (data) => {
      await this.publishEntityEvent('camera.created', 'camera', data.cameraId, data);
    });
    
    this.on('camera:updated', async (data) => {
      await this.publishEntityEvent('camera.updated', 'camera', data.cameraId, data);
    });

    // Alert events
    this.on('alert:created', async (data) => {
      await this.publishEntityEvent('alert.created', 'alert', data.alertId, data);
    });

    // Incident events
    this.on('incident:created', async (data) => {
      await this.publishEntityEvent('incident.created', 'incident', data.incidentId, data);
    });

    this.on('incident:updated', async (data) => {
      await this.publishEntityEvent('incident.updated', 'incident', data.incidentId, data);
    });

    // Recording events
    this.on('recording:started', async (data) => {
      await this.publishEntityEvent('recording.started', 'recording', data.recordingId, data);
    });

    this.on('recording:completed', async (data) => {
      await this.publishEntityEvent('recording.completed', 'recording', data.recordingId, data);
    });

    // Analytics events
    this.on('analytics:detection', async (data) => {
      await this.publishEntityEvent('analytics.detection', 'analytics_event', data.eventId, data);
    });

    logger.info('Subscribed to entity change events');
  }

  /**
   * Publish entity change event to federation bus
   */
  private async publishEntityEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      await this.federationBus.publishEvent(
        payload.tenantId || 'unknown',
        eventType,
        aggregateType,
        aggregateId,
        payload
      );

      logger.debug('Entity event published to federation bus', {
        eventType,
        aggregateId
      });

    } catch (error) {
      logger.error('Failed to publish entity event', {
        eventType,
        aggregateId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Schedule a sync job
   */
  async scheduleSyncJob(
    tenantId: string,
    sourceServerId: string,
    destinationServerId: string,
    entityType: EntityType,
    syncType: SyncType = 'incremental'
  ): Promise<SyncJob> {
    const result = await this.pool.query(
      `INSERT INTO federation_sync_jobs (
        tenant_id, source_server_id, destination_server_id,
        sync_type, entity_type, status
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pending')
      RETURNING 
        id::text,
        tenant_id::text as "tenantId",
        source_server_id::text as "sourceServerId",
        destination_server_id::text as "destinationServerId",
        sync_type as "syncType",
        entity_type as "entityType",
        status,
        synced_records as "syncedRecords",
        failed_records as "failedRecords",
        retry_count as "retryCount",
        created_at as "createdAt"`,
      [tenantId, sourceServerId, destinationServerId, syncType, entityType]
    );

    const job = result.rows[0];

    this.emit('sync:scheduled', job);

    logger.info('Sync job scheduled', {
      jobId: job.id,
      sourceServerId,
      destinationServerId,
      entityType,
      syncType
    });

    return job;
  }

  /**
   * Queue entity for replication (now uses federation bus)
   */
  async queueReplication(
    tenantId: string,
    sourceServerId: string,
    destinationServerId: string,
    entityType: EntityType,
    entityId: string,
    operation: 'create' | 'update' | 'delete',
    payload: Record<string, any>,
    priority: number = 100
  ): Promise<void> {
    // Use federation bus instead of legacy queue
    await this.federationBus.publishEvent(
      tenantId,
      `${entityType}.${operation}`,
      entityType,
      entityId,
      payload,
      {
        targetServers: [destinationServerId],
        metadata: { priority, operation }
      }
    );

    logger.debug('Entity queued via federation bus', {
      entityType,
      entityId,
      operation
    });
  }

  /**
   * Get sync status
   */
  async getSyncStatus(
    tenantId: string,
    filters?: {
      sourceServerId?: string;
      destinationServerId?: string;
      entityType?: EntityType;
      status?: SyncStatus;
    }
  ): Promise<SyncJob[]> {
    let query = `
      SELECT 
        id::text,
        tenant_id::text as "tenantId",
        source_server_id::text as "sourceServerId",
        destination_server_id::text as "destinationServerId",
        sync_type as "syncType",
        entity_type as "entityType",
        status,
        started_at as "startedAt",
        completed_at as "completedAt",
        total_records as "totalRecords",
        synced_records as "syncedRecords",
        failed_records as "failedRecords",
        duration_seconds as "durationSeconds",
        error_message as "errorMessage",
        retry_count as "retryCount",
        created_at as "createdAt"
      FROM federation_sync_jobs
      WHERE tenant_id = $1::uuid
    `;

    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.sourceServerId) {
      query += ` AND source_server_id = $${paramIndex++}::uuid`;
      params.push(filters.sourceServerId);
    }

    if (filters?.destinationServerId) {
      query += ` AND destination_server_id = $${paramIndex++}::uuid`;
      params.push(filters.destinationServerId);
    }

    if (filters?.entityType) {
      query += ` AND entity_type = $${paramIndex++}`;
      params.push(filters.entityType);
    }

    if (filters?.status) {
      query += ` AND status = $${paramIndex++}`;
      params.push(filters.status);
    }

    query += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Process pending sync jobs
   */
  private async processPendingSyncJobs(): Promise<void> {
    // Check if we have capacity for more workers
    if (this.activeSyncJobs.size >= this.MAX_SYNC_WORKERS) {
      return;
    }

    // Get pending jobs
    const result = await this.pool.query(
      `SELECT 
        id::text,
        tenant_id::text as "tenantId",
        source_server_id::text as "sourceServerId",
        destination_server_id::text as "destinationServerId",
        sync_type as "syncType",
        entity_type as "entityType"
       FROM federation_sync_jobs
       WHERE status = 'pending'
         OR (status = 'failed' AND retry_count < 3 AND next_retry_at < now())
       ORDER BY created_at
       LIMIT $1`,
      [this.MAX_SYNC_WORKERS - this.activeSyncJobs.size]
    );

    for (const job of result.rows) {
      this.executeSyncJob(job).catch(error => {
        logger.error('Sync job execution failed', {
          jobId: job.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
    }
  }

  /**
   * Execute sync job
   */
  private async executeSyncJob(job: any): Promise<void> {
    if (this.activeSyncJobs.has(job.id)) {
      return;
    }

    this.activeSyncJobs.add(job.id);

    try {
      // Mark as syncing
      await this.pool.query(
        `UPDATE federation_sync_jobs
         SET status = 'syncing',
             started_at = now()
         WHERE id = $1::uuid`,
        [job.id]
      );

      // Get source and destination servers
      const sourceServer = await this.federationManager.getServerById(job.sourceServerId);
      const destinationServer = await this.federationManager.getServerById(job.destinationServerId);

      if (!sourceServer || !destinationServer) {
        throw new Error('Source or destination server not found');
      }

      // Perform sync based on entity type
      const stats = await this.syncEntity(
        sourceServer.apiUrl,
        destinationServer.apiUrl,
        job.entityType,
        job.syncType
      );

      // Mark as completed
      await this.pool.query(
        `UPDATE federation_sync_jobs
         SET status = 'synced',
             completed_at = now(),
             total_records = $2,
             synced_records = $3,
             failed_records = $4,
             duration_seconds = EXTRACT(EPOCH FROM (now() - started_at))
         WHERE id = $1::uuid`,
        [job.id, stats.total, stats.synced, stats.failed]
      );

      this.emit('sync:completed', { jobId: job.id, stats });

      logger.info('Sync job completed', {
        jobId: job.id,
        entityType: job.entityType,
        stats
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.pool.query(
        `UPDATE federation_sync_jobs
         SET status = 'failed',
             error_message = $2,
             retry_count = retry_count + 1,
             next_retry_at = now() + interval '5 minutes'
         WHERE id = $1::uuid`,
        [job.id, errorMessage]
      );

      this.emit('sync:failed', { jobId: job.id, error: errorMessage });

      logger.error('Sync job failed', {
        jobId: job.id,
        error: errorMessage
      });

    } finally {
      this.activeSyncJobs.delete(job.id);
    }
  }

  /**
   * Sync entity data between servers (now event-driven)
   */
  private async syncEntity(
    sourceUrl: string,
    destinationUrl: string,
    entityType: EntityType,
    syncType: SyncType
  ): Promise<{ total: number; synced: number; failed: number }> {
    logger.debug('Syncing entity via event sourcing', { 
      sourceUrl, 
      destinationUrl, 
      entityType, 
      syncType 
    });

    // For full sync, query event log and replay events
    if (syncType === 'full') {
      const events = await this.federationBus.queryEvents({
        aggregateType: entityType,
        limit: 10000
      });

      let synced = 0;
      let failed = 0;

      for (const event of events) {
        try {
          // Re-publish to specific server
          await this.federationBus.publishEvent(
            event.tenant_id,
            event.event_type,
            event.aggregate_type,
            event.aggregate_id,
            event.payload,
            {
              targetServers: [destinationUrl] // This would need server ID resolution
            }
          );
          synced++;
        } catch (error) {
          failed++;
        }
      }

      return {
        total: events.length,
        synced,
        failed
      };
    }

    // Incremental sync uses the event bus automatically
    return {
      total: 0,
      synced: 0,
      failed: 0
    };
  }

  /**
   * Clean completed jobs
   */
  async cleanCompletedJobs(olderThanDays: number = 7): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM federation_sync_jobs
       WHERE status IN ('synced', 'failed')
         AND created_at < now() - interval '${olderThanDays} days'
       RETURNING id`
    );

    logger.info('Cleaned completed sync jobs', { count: result.rowCount });
    return result.rowCount || 0;
  }
}

// Singleton instance
let federationSyncService: FederationSyncService | null = null;

export function getFederationSyncService(pool: Pool, localServerId: string): FederationSyncService {
  if (!federationSyncService) {
    federationSyncService = new FederationSyncService(pool, localServerId);
  }
  return federationSyncService;
}
