/**
 * Cloud Sync Replayer & Central Receiver Service
 * Coordinates priority-ordered replay of edge outbox backlogs,
 * heals central recording index timeline gaps, and enforces idempotent deduplication.
 */

import {
  SyncBatchPayload,
  SyncBatchAck,
  QueuedBacklogItem,
} from '../domain/offline-sync.types.js';
import { StoreAndForwardOutboxService, storeAndForwardOutbox } from './store-and-forward-outbox.service.js';
import { LocalEdgeSurvivabilityService, localEdgeSurvivability } from './local-edge-survivability.service.js';
import { pool } from '../../database/pool.js';

export class CloudSyncReplayerService {
  private ingestedItemIds = new Set<string>(); // Central deduplication cache
  private healedGapsCount = 0;
  private ingestedByType: Record<string, number> = {
    P1_INCIDENTS: 0,
    RECORDING_METADATA: 0,
    AUDIT_LOGS: 0,
    OPERATIONAL_EVENTS: 0,
    HEALTH_TELEMETRY: 0,
    VIDEO_CHUNK: 0,
  };

  constructor(
    private readonly outbox: StoreAndForwardOutboxService = storeAndForwardOutbox,
    private readonly survivability: LocalEdgeSurvivabilityService = localEdgeSurvivability
  ) {}

  /**
   * Central Cloud Endpoint: Ingests a synchronized batch from an Edge Appliance.
   */
  async ingestSyncBatch(batch: SyncBatchPayload): Promise<SyncBatchAck> {
    let processedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    let newlyHealedGaps = 0;

    for (const item of batch.items) {
      // 1. Idempotent Deduplication Check
      if (this.ingestedItemIds.has(item.id)) {
        duplicateCount++;
        continue;
      }

      try {
        // 2. Process by Backlog Type
        this.processIngestedItem(item);
        this.ingestedItemIds.add(item.id);
        processedCount++;
        this.ingestedByType[item.type] = (this.ingestedByType[item.type] || 0) + 1;

        if (item.type === 'RECORDING_METADATA') {
          newlyHealedGaps++;
          this.healedGapsCount++;
        }

        // 3. Persist to cloud_sync_ingest_journal (migration 073)
        if (pool?.query) {
          await pool.query(
            `INSERT INTO cloud_sync_ingest_journal (
               item_id, branch_id, item_type, priority, payload, source_timestamp, checksum, ingested_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (item_id) DO NOTHING`,
            [
              item.id,
              item.branchId || batch.branchId,
              item.type,
              item.priority || 1,
              JSON.stringify(item.payload || {}),
              item.timestamp || new Date().toISOString(),
              item.checksum || 'checksum',
            ]
          ).catch((err) => console.warn(`[CloudSync] Ingest journal write warning:`, err));
        }
      } catch {
        failedCount++;
      }
    }

    // 4. Update branch_connectivity_status (migration 073)
    if (pool?.query) {
      await pool.query(
        `INSERT INTO branch_connectivity_status (
           branch_id, branch_name, connectivity_state, last_cloud_heartbeat,
           queued_items_count, p1_backlog_count, metadata_backlog_count,
           audit_backlog_count, events_backlog_count, health_backlog_count, updated_at
         ) VALUES ($1, $1, 'ONLINE', NOW(), $2, 0, 0, 0, 0, 0, NOW())
         ON CONFLICT (branch_id) DO UPDATE SET
           connectivity_state = 'ONLINE',
           last_cloud_heartbeat = NOW(),
           queued_items_count = EXCLUDED.queued_items_count,
           updated_at = NOW()`,
        [batch.branchId, Math.max(0, batch.itemCount - processedCount)]
      ).catch((err) => console.warn(`[CloudSync] Connectivity update warning:`, err));

      // 5. Record branch_backlog_metrics (migration 073)
      await pool.query(
        `INSERT INTO branch_backlog_metrics (
           branch_id, outage_duration_seconds, items_spooled, items_synced, items_dropped_quota, gaps_healed_count, recorded_at
         ) VALUES ($1, 0, $2, $3, 0, $4, NOW())`,
        [batch.branchId, batch.itemCount, processedCount, newlyHealedGaps]
      ).catch((err) => console.warn(`[CloudSync] Backlog metrics warning:`, err));
    }

    return {
      batchId: batch.batchId,
      branchId: batch.branchId,
      processedCount,
      duplicateCount,
      failedCount,
      healedRecordingGapsCount: newlyHealedGaps,
      acknowledgedAt: new Date().toISOString(),
      status: failedCount === 0 ? 'SUCCESS' : 'PARTIAL',
    };
  }

  /**
   * Ingest a raw video chunk backfill item into cloud ingest journal
   */
  async ingestVideoChunk(chunk: {
    segmentId: string;
    branchId: string;
    cameraId: string;
    startTime: string;
    endTime: string;
    sizeBytes: number;
    sha256: string;
    dataBase64?: string;
  }): Promise<{ status: string; itemId: string }> {
    const itemId = `VID-${chunk.segmentId}`;
    this.ingestedItemIds.add(itemId);
    this.ingestedByType.VIDEO_CHUNK = (this.ingestedByType.VIDEO_CHUNK || 0) + 1;
    this.healedGapsCount++;

    if (pool?.query) {
      await pool.query(
        `INSERT INTO cloud_sync_ingest_journal (
           item_id, branch_id, item_type, priority, payload, source_timestamp, checksum, ingested_at
         ) VALUES ($1, $2, 'VIDEO_CHUNK', 1, $3, $4, $5, NOW())
         ON CONFLICT (item_id) DO NOTHING`,
        [
          itemId,
          chunk.branchId,
          JSON.stringify({
            segmentId: chunk.segmentId,
            cameraId: chunk.cameraId,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            sizeBytes: chunk.sizeBytes,
          }),
          chunk.startTime,
          chunk.sha256,
        ]
      ).catch((err) => console.warn(`[CloudSync] Video chunk journal write warning:`, err));

      await pool.query(
        `INSERT INTO branch_backlog_metrics (
           branch_id, outage_duration_seconds, items_spooled, items_synced, items_dropped_quota, gaps_healed_count, recorded_at
         ) VALUES ($1, 0, 1, 1, 0, 1, NOW())`,
        [chunk.branchId]
      ).catch((err) => console.warn(`[CloudSync] Video backlog metrics warning:`, err));
    }

    return { status: 'SUCCESS', itemId };
  }

  /**
   * Query branch connectivity status from migration 073 table
   */
  async getBranchConnectivityStatus(branchId: string): Promise<any> {
    if (pool?.query) {
      const res = await pool.query(
        `SELECT * FROM branch_connectivity_status WHERE branch_id = $1`,
        [branchId]
      ).catch(() => null);
      if (res?.rows && res.rows[0]) {
        return res.rows[0];
      }
    }
    return this.survivability.getBranchState(branchId);
  }

  /**
   * Query branch backlog metrics from migration 073 table
   */
  async getBranchBacklogMetrics(branchId: string, limit = 20): Promise<any[]> {
    if (pool?.query) {
      const res = await pool.query(
        `SELECT * FROM branch_backlog_metrics WHERE branch_id = $1 ORDER BY recorded_at DESC LIMIT $2`,
        [branchId, limit]
      ).catch(() => null);
      if (res?.rows) {
        return res.rows;
      }
    }
    return [];
  }

  /**
   * Query cloud ingest journal from migration 073 table
   */
  async listIngestJournal(branchId: string, limit = 50): Promise<any[]> {
    if (pool?.query) {
      const res = await pool.query(
        `SELECT * FROM cloud_sync_ingest_journal WHERE branch_id = $1 ORDER BY source_timestamp DESC LIMIT $2`,
        [branchId, limit]
      ).catch(() => null);
      if (res?.rows) {
        return res.rows;
      }
    }
    return [];
  }

  private processIngestedItem(item: QueuedBacklogItem): void {
    if (!item.payload) {
      throw new Error('Malformed item payload');
    }
  }

  /**
   * Edge Replayer: Executes a synchronization cycle against the cloud receiver.
   */
  async replayPendingBacklogs(branchId: string, maxBatches = 10): Promise<{
    batchesSent: number;
    itemsSynced: number;
    healedGaps: number;
    remainingInQueue: number;
  }> {
    let batchesSent = 0;
    let totalSynced = 0;
    let totalGaps = 0;

    this.survivability.setConnectivityState('SYNCING');

    for (let b = 0; b < maxBatches; b++) {
      const batch = this.outbox.nextBatch(branchId, 50);
      if (!batch) break;

      const ack = await this.ingestSyncBatch(batch);

      if (ack.status === 'SUCCESS' || ack.status === 'PARTIAL') {
        const itemIds = batch.items.map((i) => i.id);
        this.outbox.acknowledgeBatch(branchId, itemIds);
        batchesSent++;
        totalSynced += ack.processedCount;
        totalGaps += ack.healedRecordingGapsCount;
      } else {
        const itemIds = batch.items.map((i) => i.id);
        this.outbox.failBatch(branchId, itemIds, 'Cloud ingestion failure');
      }
    }

    const remaining = this.outbox.getQueue(branchId).length;
    if (remaining === 0) {
      this.survivability.setConnectivityState('ONLINE');
    }

    return {
      batchesSent,
      itemsSynced: totalSynced,
      healedGaps: totalGaps,
      remainingInQueue: remaining,
    };
  }

  getIngestedStats(): {
    totalIngested: number;
    healedGapsCount: number;
    byType: Record<string, number>;
  } {
    return {
      totalIngested: this.ingestedItemIds.size,
      healedGapsCount: this.healedGapsCount,
      byType: this.ingestedByType,
    };
  }
}

export const cloudSyncReplayer = new CloudSyncReplayerService();
