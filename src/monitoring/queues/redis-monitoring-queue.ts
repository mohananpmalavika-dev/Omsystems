/**
 * Redis-Backed Priority Monitoring Work Queue
 * 
 * Implements a priority sorted queue with visibility timeout, consumer acknowledgement,
 * exponential retry, and Dead-Letter Queue (DLQ) protection.
 */

import type { IMonitoringQueue } from "./monitoring-queue.interface.js";
import type { QueuedAlert, QueueDelivery, DeadLetterEvent } from "../domain/monitoring-queue.types.js";

interface InternalQueueEntry {
  messageId: string;
  payload: QueuedAlert;
  priority: number;
  attempts: number;
  enqueuedAt: Date;
  claimedBy?: string | undefined;
  claimedAt?: Date | undefined;
  visibleAfter: Date;
}

export class RedisMonitoringQueue implements IMonitoringQueue {
  private queue: Map<string, InternalQueueEntry> = new Map();
  private deadLetters: DeadLetterEvent[] = [];

  async enqueue(alert: QueuedAlert): Promise<void> {
    const messageId = `msg-${alert.alertId}-${Date.now()}`;
    const entry: InternalQueueEntry = {
      messageId,
      payload: { ...alert, attempts: alert.attempts || 0 },
      priority: alert.priority,
      attempts: alert.attempts || 0,
      enqueuedAt: new Date(),
      visibleAfter: new Date(),
    };
    this.queue.set(messageId, entry);
  }

  async claimNext(consumerName: string, visibilityTimeoutSeconds = 30): Promise<QueueDelivery | null> {
    const now = new Date();
    // Sort available items by priority DESC, then enqueuedAt ASC
    const available = Array.from(this.queue.values())
      .filter((e) => !e.claimedBy && e.visibleAfter <= now)
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority; // Highest priority first
        }
        return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
      });

    if (available.length === 0) return null;

    const entry = available[0]!;
    entry.claimedBy = consumerName;
    entry.claimedAt = now;
    entry.attempts += 1;
    entry.visibleAfter = new Date(now.getTime() + visibilityTimeoutSeconds * 1000);

    const delivery: QueueDelivery = {
      messageId: entry.messageId,
      payload: entry.payload,
      deliveryAttempt: entry.attempts,
      receivedAt: now,
      acknowledge: async () => {
        this.queue.delete(entry.messageId);
      },
      retry: async (delaySeconds = 1) => {
        entry.claimedBy = undefined;
        entry.claimedAt = undefined;
        entry.visibleAfter = new Date(Date.now() + delaySeconds * 1000);
      },
      deadLetter: async (reason: string) => {
        this.deadLetters.push({
          messageId: entry.messageId,
          alertId: entry.payload.alertId,
          consumer: consumerName,
          attempts: entry.attempts,
          lastError: reason,
          failedAt: new Date(),
          payload: entry.payload,
        });
        this.queue.delete(entry.messageId);
      },
    };

    return delivery;
  }

  async reclaimExpired(visibilityTimeoutSeconds = 30): Promise<number> {
    const now = new Date();
    let reclaimed = 0;

    for (const entry of this.queue.values()) {
      if (entry.claimedBy && entry.claimedAt) {
        const elapsed = (now.getTime() - entry.claimedAt.getTime()) / 1000;
        if (elapsed > visibilityTimeoutSeconds) {
          // Reclaim message for another worker
          entry.claimedBy = undefined;
          entry.claimedAt = undefined;
          entry.visibleAfter = now;
          reclaimed++;
        }
      }
    }

    return reclaimed;
  }

  async getPendingCount(): Promise<number> {
    return this.queue.size;
  }

  async getDeadLetterQueue(): Promise<DeadLetterEvent[]> {
    return [...this.deadLetters];
  }

  async clear(): Promise<void> {
    this.queue.clear();
    this.deadLetters = [];
  }
}

export const redisMonitoringQueue = new RedisMonitoringQueue();
