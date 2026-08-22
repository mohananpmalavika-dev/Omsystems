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

export class CloudSyncReplayerService {
  private ingestedItemIds = new Set<string>(); // Central deduplication cache
  private healedGapsCount = 0;
  private ingestedByType: Record<string, number> = {
    P1_INCIDENTS: 0,
    RECORDING_METADATA: 0,
    AUDIT_LOGS: 0,
    OPERATIONAL_EVENTS: 0,
    HEALTH_TELEMETRY: 0,
  };

  constructor(
    private readonly outbox: StoreAndForwardOutboxService = storeAndForwardOutbox,
    private readonly survivability: LocalEdgeSurvivabilityService = localEdgeSurvivability
  ) {}

  /**
   * Central Cloud Endpoint: Ingests a synchronized batch from an Edge Appliance.
   */
  ingestSyncBatch(batch: SyncBatchPayload): SyncBatchAck {
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
      } catch {
        failedCount++;
      }
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

  private processIngestedItem(item: QueuedBacklogItem): void {
    // In real system, dispatches to respective services (Incident, RecordingIndex, Audit)
    // Here we simulate the processing of payload fields
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

      // Simulate sending batch to Central Receiver (or local invocation)
      const ack = this.ingestSyncBatch(batch);

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
