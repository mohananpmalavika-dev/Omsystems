/**
 * Event Inbox Repository
 * 
 * Idempotent consumer inbox for deduplicating incoming events from at-least-once message brokers.
 */

import type { Pool } from "pg";
import type { EventInboxRecord } from "../domain/normalized-event.types.js";

export class EventInboxRepository {
  private inMemoryInbox: Set<string> = new Set(); // key: `${consumerName}:${messageId}`

  constructor(private readonly pool?: Pool | undefined) {}

  async shouldProcess(consumerName: string, messageId: string): Promise<boolean> {
    const key = `${consumerName}:${messageId}`;
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        const res = await client.query(
          `INSERT INTO event_inbox (consumer_name, message_id, received_at)
           VALUES ($1, $2, now())
           ON CONFLICT (consumer_name, message_id) DO NOTHING
           RETURNING *;`,
          [consumerName, messageId]
        );
        return (res.rowCount ?? 0) > 0;
      } finally {
        client.release();
      }
    } else {
      if (this.inMemoryInbox.has(key)) {
        return false;
      }
      this.inMemoryInbox.add(key);
      return true;
    }
  }

  async markProcessed(consumerName: string, messageId: string): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `UPDATE event_inbox SET processed_at = now() WHERE consumer_name = $1 AND message_id = $2`,
        [consumerName, messageId]
      );
    }
  }

  clear() {
    this.inMemoryInbox.clear();
  }
}

export const eventInboxRepository = new EventInboxRepository();
