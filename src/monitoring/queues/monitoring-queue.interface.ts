/**
 * Monitoring Queue Interface
 */

import type { QueuedAlert, QueueDelivery, DeadLetterEvent } from "../domain/monitoring-queue.types.js";

export interface IMonitoringQueue {
  enqueue(alert: QueuedAlert): Promise<void>;
  claimNext(consumerName: string, visibilityTimeoutSeconds?: number): Promise<QueueDelivery | null>;
  reclaimExpired(visibilityTimeoutSeconds?: number): Promise<number>;
  getPendingCount(): Promise<number>;
  getDeadLetterQueue(): Promise<DeadLetterEvent[]>;
  clear(): Promise<void>;
}
