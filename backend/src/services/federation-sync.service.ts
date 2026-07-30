/**
 * Federation Sync Service
 * Handles metadata replication and event synchronization between servers
 */

import { EventEmitter } from 'events';
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';
import { getFederationManager } from './federation-manager.service.js';

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
  private syncInterval?: NodeJS.Timeout;
  private replicationInterval?: NodeJS.Timeout;
  private readonly SYNC_INTERVAL_MS = 60000; // 1 minute
  private readonly REPLICATION_INTERVAL_MS = 5000; // 5 seconds
  private readonly MAX_SYNC_WORKERS = 3;
  private activeSyncJobs: Set<string> = new Set();

  constructor(pool: Pool) {
    super();
    this.pool = pool;
    this.federationManager = getFederationManager(pool);
  }

  /**
   * Start sync service
   */
  async start(): Promise<void> {
    logger.info('Starting Federation Sync Service');

    // Start periodic sync jobs
    this.syncInterval = setInterval(async () => {
      try {
        await this.processPendingSyncJobs();
      } catch (error) {
        logger.error('Sync job processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.SYNC_INTERVAL_MS);

    // Start realtime replication processing
    this.replicationInterval = setInterval(async () => {
      try {
        await this.processReplicationQueue();
      } catch (error) {
        logger.error('Replication queue processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.REPLICATION_INTERVAL_MS);

    logger.info('Federation Sync Service started');
  }

  /**
   * Stop sync service
   */
  async stop(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    if (this.replicationInterval) {
      clearInterval(this.replicationInterval);
    }
    logger.info('Federation Sync Service stopped');
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
   * Queue entity for replication
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
    await this.pool.query(
      `INSERT INTO federation_replication_queue (
        tenant_id, source_server_id, destination_server_id,
        entity_type, entity_id, operation, payload,
        priority, status
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6, $7, $8, 'pending')
      ON CONFLICT DO NOTHING`,
      [
        tenantId,
        sourceServerId,
        destinationServerId,
        entityType,
        entityId,
        operation,
        JSON.stringify(payload),
        priority
      ]
    );

    logger.debug('Entity queued for replication', {
      entityType,
      entityId,
      operation,
      sourceServerId,
      destinationServerId
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
   * Sync entity data between servers
   */
  private async syncEntity(
    sourceUrl: string,
    destinationUrl: string,
    entityType: EntityType,
    syncType: SyncType
  ): Promise<{ total: number; synced: number; failed: number }> {
    // Placeholder implementation
    // In production, this would fetch data from source and push to destination
    
    logger.debug('Syncing entity', { sourceUrl, destinationUrl, entityType, syncType });

    // Simulate sync operation
    await new Promise(resolve => setTimeout(resolve, 1000));

    return {
      total: 100,
      synced: 95,
      failed: 5
    };
  }

  /**
   * Process replication queue
   */
  private async processReplicationQueue(): Promise<void> {
    // Get pending items
    const result = await this.pool.query(
      `SELECT 
        id,
        tenant_id::text as "tenantId",
        source_server_id::text as "sourceServerId",
        destination_server_id::text as "destinationServerId",
        entity_type as "entityType",
        entity_id::text as "entityId",
        operation,
        payload,
        priority
       FROM federation_replication_queue
       WHERE status = 'pending'
         OR (status = 'failed' AND retry_count < max_retries AND next_retry_at < now())
       ORDER BY priority DESC, created_at
       LIMIT 100`
    );

    for (const item of result.rows) {
      try {
        await this.replicateEntity(item);
        
        await this.pool.query(
          `UPDATE federation_replication_queue
           SET status = 'completed',
               processed_at = now()
           WHERE id = $1`,
          [item.id]
        );

        this.emit('replication:completed', { itemId: item.id });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        await this.pool.query(
          `UPDATE federation_replication_queue
           SET status = 'failed',
               error_message = $2,
               retry_count = retry_count + 1,
               next_retry_at = now() + interval '1 minute'
           WHERE id = $1`,
          [item.id, errorMessage]
        );

        logger.error('Replication failed', {
          itemId: item.id,
          entityType: item.entityType,
          error: errorMessage
        });
      }
    }
  }

  /**
   * Replicate single entity
   */
  private async replicateEntity(item: any): Promise<void> {
    const destinationServer = await this.federationManager.getServerById(
      item.destinationServerId
    );

    if (!destinationServer) {
      throw new Error('Destination server not found');
    }

    // Send replication request to destination server
    const endpoint = this.getReplicationEndpoint(item.entityType, item.operation);
    const url = new URL(endpoint, destinationServer.apiUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Replication-Source': item.sourceServerId
      },
      body: JSON.stringify({
        entityId: item.entityId,
        operation: item.operation,
        payload: item.payload
      })
    });

    if (!response.ok) {
      throw new Error(`Replication failed: HTTP ${response.status}`);
    }

    logger.debug('Entity replicated successfully', {
      entityType: item.entityType,
      entityId: item.entityId,
      operation: item.operation
    });
  }

  /**
   * Get replication endpoint for entity type
   */
  private getReplicationEndpoint(
    entityType: EntityType,
    operation: string
  ): string {
    const endpoints: Record<EntityType, string> = {
      cameras: '/v1/federation/replicate/cameras',
      alerts: '/v1/federation/replicate/alerts',
      incidents: '/v1/federation/replicate/incidents',
      users: '/v1/federation/replicate/users',
      recordings: '/v1/federation/replicate/recordings',
      analytics: '/v1/federation/replicate/analytics'
    };

    return endpoints[entityType] || '/v1/federation/replicate';
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

export function getFederationSyncService(pool: Pool): FederationSyncService {
  if (!federationSyncService) {
    federationSyncService = new FederationSyncService(pool);
  }
  return federationSyncService;
}
