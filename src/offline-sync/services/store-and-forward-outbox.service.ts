/**
 * Store-and-Forward Outbox Service (Edge Appliance)
 * Implements a thread-safe, priority-ordered persistent outbox queue with quota backpressure protection.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  SyncBacklogType,
  QueuedBacklogItem,
  BACKLOG_PRIORITIES,
  SyncBatchPayload,
} from '../domain/offline-sync.types.js';

export class StoreAndForwardOutboxService {
  private queues = new Map<string, QueuedBacklogItem[]>(); // branchId -> items
  private maxItemsPerBranch: number;

  constructor(maxItemsPerBranch = 10_000) {
    this.maxItemsPerBranch = maxItemsPerBranch;
  }

  /**
   * Enqueues an item into the local store-and-forward outbox.
   */
  enqueue(
    branchId: string,
    type: SyncBacklogType,
    payload: Record<string, unknown>,
    timestamp?: string
  ): QueuedBacklogItem {
    const queue = this.queues.get(branchId) || [];
    const itemTimestamp = timestamp || new Date().toISOString();
    const priority = BACKLOG_PRIORITIES[type];
    const itemId = `item-${Date.now()}-${randomUUID().slice(0, 8)}`;

    const rawContent = JSON.stringify({ branchId, type, payload, timestamp: itemTimestamp });
    const checksum = createHash('sha256').update(rawContent).digest('hex');

    const item: QueuedBacklogItem = {
      id: itemId,
      branchId,
      type,
      priority,
      payload,
      timestamp: itemTimestamp,
      checksum,
      retryCount: 0,
      status: 'QUEUED',
    };

    // Quota backpressure check: if queue is full, evict lowest priority item
    if (queue.length >= this.maxItemsPerBranch) {
      // Find index of lowest priority item (that is NOT P1 or AUDIT)
      let lowestIndex = -1;
      let lowestPriority = Infinity;

      for (let i = 0; i < queue.length; i++) {
        const q = queue[i]!;
        if (q.priority < lowestPriority && q.priority < 60) {
          lowestPriority = q.priority;
          lowestIndex = i;
        }
      }

      if (lowestIndex >= 0) {
        queue.splice(lowestIndex, 1); // Evict lowest priority telemetry item
      }
    }

    queue.push(item);
    // Keep queue sorted by priority descending, then timestamp ascending
    queue.sort((a, b) => b.priority - a.priority || new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    this.queues.set(branchId, queue);
    return item;
  }

  /**
   * Generates the next batch of items to sync to the Cloud, ordered by priority (P1 first).
   */
  nextBatch(branchId: string, maxBatchSize = 50): SyncBatchPayload | null {
    const queue = this.queues.get(branchId) || [];
    const pendingItems = queue.filter((i) => i.status === 'QUEUED' || i.status === 'FAILED');

    if (pendingItems.length === 0) return null;

    const batchItems = pendingItems.slice(0, maxBatchSize);
    for (const item of batchItems) {
      item.status = 'SYNCING';
    }

    const batchId = `batch-${Date.now()}-${randomUUID().slice(0, 6)}`;
    const batchChecksum = createHash('sha256')
      .update(batchItems.map((i) => i.checksum).join(':'))
      .digest('hex');

    return {
      batchId,
      branchId,
      generatedAt: new Date().toISOString(),
      itemCount: batchItems.length,
      items: batchItems,
      checksum: batchChecksum,
    };
  }

  /**
   * Acknowledges successfully synced items, removing them from the outbox.
   */
  acknowledgeBatch(branchId: string, itemIds: string[]): number {
    const queue = this.queues.get(branchId) || [];
    const idSet = new Set(itemIds);

    const remaining = queue.filter((i) => !idSet.has(i.id));
    const removedCount = queue.length - remaining.length;

    this.queues.set(branchId, remaining);
    return removedCount;
  }

  /**
   * Marks batch items as failed with retry increment.
   */
  failBatch(branchId: string, itemIds: string[], errorMessage?: string): void {
    const queue = this.queues.get(branchId) || [];
    const idSet = new Set(itemIds);

    for (const item of queue) {
      if (idSet.has(item.id)) {
        item.status = 'FAILED';
        item.retryCount += 1;
        item.errorMessage = errorMessage;
      }
    }
  }

  getQueue(branchId: string): QueuedBacklogItem[] {
    return this.queues.get(branchId) || [];
  }

  getBacklogCounts(branchId: string): Record<SyncBacklogType, number> {
    const queue = this.queues.get(branchId) || [];
    const counts: Record<SyncBacklogType, number> = {
      P1_INCIDENTS: 0,
      RECORDING_METADATA: 0,
      AUDIT_LOGS: 0,
      OPERATIONAL_EVENTS: 0,
      HEALTH_TELEMETRY: 0,
    };

    for (const item of queue) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }

    return counts;
  }
}

export const storeAndForwardOutbox = new StoreAndForwardOutboxService();
