/**
 * Event Outbox Worker
 * 
 * Asynchronously publishes pending outbox records to the distributed event bus.
 */

import { eventOutboxRepository, EventOutboxRepository } from "../repositories/event-outbox.repository.js";
import { unifiedEventBus, IEventBus } from "../unified-event-bus.js";

export class EventOutboxWorker {
  private timer?: NodeJS.Timeout | undefined;
  private isProcessing = false;

  constructor(
    private readonly outboxRepo: EventOutboxRepository = eventOutboxRepository,
    private readonly eventBus: IEventBus = unifiedEventBus
  ) {}

  start(intervalMs = 500) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.processBatch().catch((err) => {
        console.error("Error processing event outbox batch:", err);
      });
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async processBatch(limit = 100): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;
    let publishedCount = 0;

    try {
      const records = await this.outboxRepo.claimBatch(limit);
      for (const rec of records) {
        try {
          await this.eventBus.publish(rec.eventType, rec.payload);
          await this.outboxRepo.markPublished(rec.id);
          publishedCount++;
        } catch (err) {
          await this.outboxRepo.markFailed(rec.id, err);
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return publishedCount;
  }
}

export const eventOutboxWorker = new EventOutboxWorker();
