/**
 * Surveillance Event Repository
 * 
 * Provides durable storage and idempotent insertion for normalized surveillance events.
 * Enforces UNIQUE(eventId) constraint to guarantee exactly-once persistence.
 */

import type { Pool } from "pg";
import type { NormalizedEvent } from "../domain/normalized-event.types.js";

export class SurveillanceEventRepository {
  private inMemoryEvents: Map<string, NormalizedEvent> = new Map();

  constructor(private readonly pool?: Pool | undefined) {}

  async persist(event: NormalizedEvent): Promise<{ event: NormalizedEvent; isDuplicate: boolean }> {
    const persistedAt = new Date().toISOString();
    const normalized: NormalizedEvent = { ...event, persistedAt };

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        const query = `
          INSERT INTO surveillance_events (
            id, tenant_id, branch_id, source_type, source_id,
            event_type, severity, camera_id, recorder_id,
            title, description, occurred_at, received_at,
            attributes, evidence, correlation_id, schema_version
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING *;
        `;
        const res = await client.query(query, [
          normalized.eventId,
          normalized.tenantId,
          normalized.branchId,
          normalized.source.type,
          normalized.source.sourceId,
          normalized.eventType,
          normalized.severity,
          normalized.cameraId ?? null,
          normalized.recorderId ?? null,
          normalized.title,
          normalized.description ?? null,
          normalized.occurredAt,
          normalized.receivedAt,
          JSON.stringify(normalized.attributes),
          normalized.evidence ? JSON.stringify(normalized.evidence) : null,
          normalized.correlationId ?? null,
          normalized.schemaVersion,
        ]);

        if (res.rowCount === 0) {
          // Duplicate event dropped cleanly
          return { event: normalized, isDuplicate: true };
        }
        return { event: normalized, isDuplicate: false };
      } finally {
        client.release();
      }
    } else {
      if (this.inMemoryEvents.has(normalized.eventId)) {
        return { event: this.inMemoryEvents.get(normalized.eventId)!, isDuplicate: true };
      }
      this.inMemoryEvents.set(normalized.eventId, normalized);
      return { event: normalized, isDuplicate: false };
    }
  }

  async findById(eventId: string): Promise<NormalizedEvent | undefined> {
    if (this.pool) {
      const res = await this.pool.query("SELECT * FROM surveillance_events WHERE id = $1", [eventId]);
      if (res.rowCount === 0) return undefined;
      const row = res.rows[0];
      return {
        eventId: row.id,
        tenantId: row.tenant_id,
        branchId: row.branch_id,
        source: { type: row.source_type, sourceId: row.source_id },
        eventType: row.event_type,
        severity: row.severity,
        occurredAt: row.occurred_at.toISOString(),
        receivedAt: row.received_at.toISOString(),
        cameraId: row.camera_id,
        recorderId: row.recorder_id,
        title: row.title,
        description: row.description,
        attributes: row.attributes,
        evidence: row.evidence,
        correlationId: row.correlation_id,
        schemaVersion: row.schema_version,
      };
    }
    return this.inMemoryEvents.get(eventId);
  }

  async count(): Promise<number> {
    if (this.pool) {
      const res = await this.pool.query("SELECT COUNT(*) FROM surveillance_events");
      return Number(res.rows[0].count);
    }
    return this.inMemoryEvents.size;
  }

  clear() {
    this.inMemoryEvents.clear();
  }
}

export const surveillanceEventRepository = new SurveillanceEventRepository();
