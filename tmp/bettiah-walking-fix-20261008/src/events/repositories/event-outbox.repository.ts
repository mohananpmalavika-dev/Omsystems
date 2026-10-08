/**
 * Event Outbox Repository
 * 
 * Implements the Transactional Outbox pattern to atomically persist events
 * and outbox publishing jobs within single database transactions.
 */

import type { Pool } from "pg";
import type { EventOutboxRecord } from "../domain/normalized-event.types.js";

export class EventOutboxRepository {
  private inMemoryOutbox: Map<string, EventOutboxRecord> = new Map();

  constructor(private readonly pool?: Pool | undefined) {}

  async create(record: Omit<EventOutboxRecord, "id" | "status" | "attempts" | "createdAt"> & { id?: string }): Promise<EventOutboxRecord> {
    const id = record.id || `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const full: EventOutboxRecord = {
      id,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      payload: record.payload,
      status: "PENDING",
      attempts: 0,
      availableAt: record.availableAt || new Date(),
      createdAt: new Date(),
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO event_outbox (
          id, aggregate_type, aggregate_id, event_type, payload, status, attempts, available_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          full.id,
          full.aggregateType,
          full.aggregateId,
          full.eventType,
          JSON.stringify(full.payload),
          full.status,
          full.attempts,
          full.availableAt,
          full.createdAt,
        ]
      );
    } else {
      this.inMemoryOutbox.set(full.id, full);
    }

    return full;
  }

  async claimBatch(limit = 100): Promise<EventOutboxRecord[]> {
    const now = new Date();
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM event_outbox
         WHERE status = 'PENDING' AND available_at <= $1
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [now, limit]
      );
      return res.rows.map((r) => ({
        id: r.id,
        aggregateType: r.aggregate_type,
        aggregateId: r.aggregate_id,
        eventType: r.event_type,
        payload: r.payload,
        status: r.status,
        attempts: r.attempts,
        availableAt: r.available_at,
        publishedAt: r.published_at,
        lastError: r.last_error,
        createdAt: r.created_at,
      }));
    } else {
      const available: EventOutboxRecord[] = [];
      for (const rec of this.inMemoryOutbox.values()) {
        if (rec.status === "PENDING" && rec.availableAt <= now) {
          available.push(rec);
          if (available.length >= limit) break;
        }
      }
      return available;
    }
  }

  async markPublished(id: string): Promise<void> {
    const now = new Date();
    if (this.pool) {
      await this.pool.query(
        `UPDATE event_outbox SET status = 'PUBLISHED', published_at = $1 WHERE id = $2`,
        [now, id]
      );
    } else {
      const rec = this.inMemoryOutbox.get(id);
      if (rec) {
        rec.status = "PUBLISHED";
        rec.publishedAt = now;
      }
    }
  }

  async markFailed(id: string, error: unknown): Promise<void> {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (this.pool) {
      await this.pool.query(
        `UPDATE event_outbox
         SET attempts = attempts + 1,
             last_error = $1,
             available_at = now() + (interval '2 seconds' * POWER(2, attempts))
         WHERE id = $2`,
        [errMsg, id]
      );
    } else {
      const rec = this.inMemoryOutbox.get(id);
      if (rec) {
        rec.attempts += 1;
        rec.lastError = errMsg;
        rec.availableAt = new Date(Date.now() + Math.pow(2, rec.attempts) * 2000);
      }
    }
  }

  clear() {
    this.inMemoryOutbox.clear();
  }
}

export const eventOutboxRepository = new EventOutboxRepository();
