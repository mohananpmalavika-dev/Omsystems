/**
 * Incident Sync Job
 * 
 * Background job to sync Redis correlation incidents to PostgreSQL
 * for long-term storage and querying.
 */

import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { getIncidentService } from '../services/incident.service.js';
import { getAlertCorrelationService, type Incident as RedisIncident } from '../services/alert-correlation.service.js';

export class IncidentSyncJob {
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
    private readonly intervalMs: number = 60_000, // 1 minute default
  ) {}

  /**
   * Start the sync job
   */
  start(): void {
    if (this.syncInterval) {
      console.log('[IncidentSyncJob] Already running');
      return;
    }

    console.log(`[IncidentSyncJob] Starting with interval: ${this.intervalMs}ms`);

    // Run immediately on start
    this.runSync().catch(error => {
      console.error('[IncidentSyncJob] Initial sync failed:', error);
    });

    // Schedule periodic sync
    this.syncInterval = setInterval(() => {
      if (!this.isRunning) {
        this.runSync().catch(error => {
          console.error('[IncidentSyncJob] Sync failed:', error);
        });
      }
    }, this.intervalMs);
  }

  /**
   * Stop the sync job
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[IncidentSyncJob] Stopped');
    }
  }

  /**
   * Run a single sync operation
   */
  private async runSync(): Promise<void> {
    if (this.isRunning) {
      console.log('[IncidentSyncJob] Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[IncidentSyncJob] Starting sync...');

      // Get all Redis incidents
      const correlationService = getAlertCorrelationService(this.redis);
      const pattern = `correlation:incidents:*`;
      
      let cursor = '0';
      let totalScanned = 0;
      let syncedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        totalScanned += keys.length;

        for (const key of keys) {
          try {
            const data = await this.redis.get(key);
            if (!data) {
              skippedCount++;
              continue;
            }

            const redisIncident: RedisIncident = JSON.parse(data);

            // Extract tenant from affected branches (first branch)
            // In production, you'd have a proper tenant mapping strategy
            const tenantId = await this.resolveTenantForIncident(redisIncident);
            
            if (!tenantId) {
              console.warn(
                `[IncidentSyncJob] No tenant found for incident ${redisIncident.id}`
              );
              skippedCount++;
              continue;
            }

            const incidentService = getIncidentService(this.pool, this.redis);

            // Check if already persisted
            const exists = await incidentService.getIncidentById(
              tenantId,
              redisIncident.id,
            );

            if (exists) {
              skippedCount++;
              continue;
            }

            // Persist to PostgreSQL
            await incidentService.persistRedisIncident(redisIncident, tenantId);
            syncedCount++;

            console.log(
              `[IncidentSyncJob] Synced incident ${redisIncident.id} (${redisIncident.title})`
            );
          } catch (error) {
            errorCount++;
            console.error(
              `[IncidentSyncJob] Error syncing incident from key ${key}:`,
              error
            );
          }
        }
      } while (cursor !== '0');

      const duration = Date.now() - startTime;

      console.log(
        `[IncidentSyncJob] Sync completed in ${duration}ms: ` +
        `scanned=${totalScanned}, synced=${syncedCount}, ` +
        `skipped=${skippedCount}, errors=${errorCount}`
      );
    } catch (error) {
      console.error('[IncidentSyncJob] Sync failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Resolve tenant ID for a Redis incident
   * 
   * Strategy: Look up branch->tenant mapping from database
   */
  private async resolveTenantForIncident(
    incident: RedisIncident,
  ): Promise<string | null> {
    // If incident has a branch, query tenant from branches table
    if (incident.affectedBranches.length > 0) {
      const branchId = incident.affectedBranches[0];
      
      try {
        const result = await this.pool.query(
          'SELECT tenant_id FROM branches WHERE id = $1 LIMIT 1',
          [branchId],
        );

        if (result.rows.length > 0) {
          return result.rows[0].tenant_id;
        }
      } catch (error) {
        console.error(
          `[IncidentSyncJob] Error resolving tenant for branch ${branchId}:`,
          error
        );
      }
    }

    // If incident has a camera, query tenant from cameras table
    if (incident.affectedCameras.length > 0) {
      const cameraId = incident.affectedCameras[0];
      
      try {
        const result = await this.pool.query(
          'SELECT tenant_id FROM cameras WHERE id = $1 LIMIT 1',
          [cameraId],
        );

        if (result.rows.length > 0) {
          return result.rows[0].tenant_id;
        }
      } catch (error) {
        console.error(
          `[IncidentSyncJob] Error resolving tenant for camera ${cameraId}:`,
          error
        );
      }
    }

    // Fallback: Check metadata for tenant hint
    if (incident.metadata?.tenantId) {
      return incident.metadata.tenantId;
    }

    return null;
  }

  /**
   * Subscribe to Redis pub/sub for real-time incident creation
   */
  async subscribeToIncidentEvents(): Promise<void> {
    const subscriber = this.redis.duplicate();
    
    await subscriber.subscribe('incident:created');
    
    subscriber.on('message', async (channel, message) => {
      if (channel === 'incident:created') {
        try {
          const { incidentId } = JSON.parse(message);
          console.log(`[IncidentSyncJob] Real-time sync triggered for ${incidentId}`);
          
          // Fetch and persist immediately
          const correlationService = getAlertCorrelationService(this.redis);
          const incident = await correlationService.getIncident(incidentId);
          
          if (incident) {
            const tenantId = await this.resolveTenantForIncident(incident);
            
            if (tenantId) {
              const incidentService = getIncidentService(this.pool, this.redis);
              await incidentService.persistRedisIncident(incident, tenantId);
              console.log(`[IncidentSyncJob] Real-time synced ${incidentId}`);
            }
          }
        } catch (error) {
          console.error('[IncidentSyncJob] Real-time sync error:', error);
        }
      }
    });

    console.log('[IncidentSyncJob] Subscribed to incident:created events');
  }
}

/**
 * Singleton instance
 */
let jobInstance: IncidentSyncJob | null = null;

export function getIncidentSyncJob(
  pool: Pool,
  redis: Redis,
  intervalMs?: number,
): IncidentSyncJob {
  if (!jobInstance) {
    jobInstance = new IncidentSyncJob(pool, redis, intervalMs);
  }
  return jobInstance;
}
