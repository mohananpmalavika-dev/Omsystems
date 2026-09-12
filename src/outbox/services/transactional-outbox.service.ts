/**
 * Transactional Outbox & Idempotent Inbox Service
 * 
 * Enforces:
 * 1. Transactional Outbox: Events are atomically persisted in the same DB transaction as domain mutations.
 * 2. Exactly-Once Processing: Consumer uses event_inbox deduplication table.
 * 3. Idempotency: Duplicate events with the same idempotency_key are safely ignored.
 */

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";

export interface OutboxEventInput {
  eventId?: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion?: string;
  correlationId: string;
  idempotencyKey?: string;
  payload: Record<string, unknown>;
}

export interface OutboxRecord {
  id: string;
  eventId: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  schemaVersion: string;
  correlationId: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  published: boolean;
  publishedAt?: Date;
  createdAt: Date;
}

export class TransactionalOutboxService {
  private readonly memoryOutbox = new Map<string, OutboxRecord>();
  private readonly memoryInbox = new Set<string>();

  constructor(private readonly pool?: Pool) {
    if (process.env.NODE_ENV === "production" && !this.pool) {
      throw new Error("OUTBOX_STORE_UNAVAILABLE: TransactionalOutboxService requires PostgreSQL pool in production");
    }
  }

  async writeOutboxEvent(clientOrPool: Pool | PoolClient | undefined, event: OutboxEventInput): Promise<OutboxRecord> {
    const isProduction = process.env.NODE_ENV === "production";
    const eventId = event.eventId || randomUUID();
    const idempotencyKey = event.idempotencyKey || `${event.tenantId}:${event.eventType}:${eventId}`;
    const schemaVersion = event.schemaVersion || "1.0.0";
    const now = new Date();

    const record: OutboxRecord = {
      id: randomUUID(),
      eventId,
      tenantId: event.tenantId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      schemaVersion,
      correlationId: event.correlationId,
      idempotencyKey,
      payload: event.payload,
      published: false,
      createdAt: now,
    };

    const client = clientOrPool || this.pool;
    if (isProduction && !client) {
      throw new Error("OUTBOX_STORE_UNAVAILABLE: PostgreSQL client required in production for outbox");
    }

    if (client) {
      try {
        const res = await (client as any).query(
          `INSERT INTO event_outbox (
            event_id, tenant_id, aggregate_type, aggregate_id, event_type,
            schema_version, correlation_id, idempotency_key, payload, published, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)
          ON CONFLICT (idempotency_key) DO NOTHING
          RETURNING *`,
          [
            record.eventId,
            record.tenantId,
            record.aggregateType,
            record.aggregateId,
            record.eventType,
            record.schemaVersion,
            record.correlationId,
            record.idempotencyKey,
            JSON.stringify(record.payload),
            now,
          ]
        );

        if (res.rows.length > 0) {
          const row = res.rows[0];
          record.id = row.id;
          return record;
        }

        // On conflict do nothing returned 0 rows, retrieve existing record
        const conflictRes = await (client as any).query(
          `SELECT * FROM event_outbox WHERE idempotency_key = $1`,
          [record.idempotencyKey]
        );
        if (conflictRes.rows.length > 0) {
          const row = conflictRes.rows[0];
          return {
            id: row.id,
            eventId: row.event_id,
            tenantId: row.tenant_id,
            aggregateType: row.aggregate_type,
            aggregateId: row.aggregate_id,
            eventType: row.event_type,
            schemaVersion: row.schema_version,
            correlationId: row.correlation_id,
            idempotencyKey: row.idempotency_key,
            payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
            published: row.published,
            createdAt: new Date(row.created_at),
          };
        }
      } catch (err) {
        if (isProduction) {
          throw new Error(`OUTBOX_STORE_UNAVAILABLE: Database error writing outbox event: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (isProduction) {
      throw new Error("OUTBOX_STORE_UNAVAILABLE: In-memory outbox is forbidden in production");
    }

    const existingMemory = this.memoryOutbox.get(idempotencyKey);
    if (existingMemory) {
      return existingMemory;
    }

    this.memoryOutbox.set(idempotencyKey, record);
    return record;
  }

  async claimUnpublishedEvents(limit = 50): Promise<OutboxRecord[]> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          `SELECT * FROM event_outbox 
           WHERE published = false 
           ORDER BY created_at ASC 
           LIMIT $1 
           FOR UPDATE SKIP LOCKED`,
          [limit]
        );

        const records: OutboxRecord[] = res.rows.map((r) => ({
          id: r.id,
          eventId: r.event_id,
          tenantId: r.tenant_id,
          aggregateType: r.aggregate_type,
          aggregateId: r.aggregate_id,
          eventType: r.event_type,
          schemaVersion: r.schema_version,
          correlationId: r.correlation_id,
          idempotencyKey: r.idempotency_key,
          payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
          published: r.published,
          createdAt: new Date(r.created_at),
        }));

        await client.query("COMMIT");
        return records;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        return [];
      } finally {
        client.release();
      }
    }

    return Array.from(this.memoryOutbox.values()).filter((r) => !r.published).slice(0, limit);
  }

  async markPublished(eventId: string): Promise<void> {
    const now = new Date();
    if (this.pool) {
      await this.pool.query(
        `UPDATE event_outbox SET published = true, published_at = $1 WHERE event_id = $2`,
        [now, eventId]
      );
      return;
    }

    for (const rec of this.memoryOutbox.values()) {
      if (rec.eventId === eventId) {
        rec.published = true;
        rec.publishedAt = now;
      }
    }
  }

  async recordInboxProcessed(eventId: string, consumerId: string): Promise<boolean> {
    const isProduction = process.env.NODE_ENV === "production";
    const key = `${eventId}:${consumerId}`;

    if (isProduction && !this.pool) {
      throw new Error("INBOX_STORE_UNAVAILABLE: PostgreSQL pool required in production for event inbox");
    }

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `INSERT INTO event_inbox (event_id, consumer_id, result)
           VALUES ($1, $2, 'SUCCESS')
           ON CONFLICT (event_id, consumer_id) DO NOTHING
           RETURNING id`,
          [eventId, consumerId]
        );
        return (res.rowCount || 0) > 0;
      } catch (err) {
        if (isProduction) {
          throw new Error(`INBOX_STORE_UNAVAILABLE: Failed to record inbox event: ${err instanceof Error ? err.message : String(err)}`);
        }
        return false;
      }
    }

    if (isProduction) {
      throw new Error("INBOX_STORE_UNAVAILABLE: In-memory inbox is forbidden in production");
    }

    if (this.memoryInbox.has(key)) {
      return false; // Already processed
    }
    this.memoryInbox.add(key);
    return true;
  }
}

export const transactionalOutboxService = new TransactionalOutboxService();
