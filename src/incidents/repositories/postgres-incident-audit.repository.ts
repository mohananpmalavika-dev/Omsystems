import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { IncidentAuditEvent } from "../domain/playbook.types.js";

export class PostgresIncidentAuditRepository {
  private readonly memoryEvents: IncidentAuditEvent[] = [];

  constructor(private readonly pool?: Pool) {}

  async append(event: Omit<IncidentAuditEvent, "eventId" | "timestamp">): Promise<IncidentAuditEvent> {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    const fullEvent: IncidentAuditEvent = {
      ...event,
      eventId,
      timestamp,
    };

    if (this.pool) {
      try {
        const actorId = event.actor?.userId || event.actor?.userName || "SYSTEM";
        await this.pool.query(
          `INSERT INTO incident_audit_events (
             id, tenant_id, incident_id, actor_id, action, previous_state, new_state, details, source_ip, occurred_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            eventId,
            event.tenantId || "global",
            event.incidentId,
            actorId,
            event.eventType,
            event.details?.previousState ? JSON.stringify(event.details.previousState) : null,
            event.details?.newState ? JSON.stringify(event.details.newState) : null,
            JSON.stringify(event.details || {}),
            event.details?.sourceIp || null,
            new Date(timestamp),
          ],
        );
        return fullEvent;
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_AUDIT_STORE_UNAVAILABLE: Failed to write immutable incident audit: ${(err as Error).message}`);
        }
        console.warn("[PostgresIncidentAuditRepo] append DB error:", err);
      }
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("INCIDENT_AUDIT_STORE_UNAVAILABLE: PostgreSQL required for incident audit in production");
    }

    this.memoryEvents.push(fullEvent);
    return fullEvent;
  }

  async getTimeline(incidentId: string): Promise<IncidentAuditEvent[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, tenant_id, incident_id, actor_id, action, details, occurred_at
           FROM incident_audit_events
           WHERE incident_id = $1
           ORDER BY occurred_at ASC`,
          [incidentId],
        );
        return res.rows.map((row) => ({
          eventId: row.id,
          tenantId: row.tenant_id,
          incidentId: row.incident_id,
          eventType: (row.action as any) || "STEP_COMPLETED",
          actor: {
            type: "USER" as const,
            userId: row.actor_id,
            userName: row.actor_id,
          },
          details: typeof row.details === "string" ? JSON.parse(row.details) : (row.details || {}),
          timestamp: new Date(row.occurred_at).toISOString(),
        }));
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_AUDIT_STORE_UNAVAILABLE: Failed to read incident timeline: ${(err as Error).message}`);
        }
        console.warn("[PostgresIncidentAuditRepo] getTimeline DB error:", err);
      }
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("INCIDENT_AUDIT_STORE_UNAVAILABLE: PostgreSQL required for incident audit in production");
    }

    return this.memoryEvents
      .filter((e) => e.incidentId === incidentId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async listAll(): Promise<IncidentAuditEvent[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, tenant_id, incident_id, actor_id, action, details, occurred_at
           FROM incident_audit_events
           ORDER BY occurred_at DESC LIMIT 1000`,
        );
        return res.rows.map((row) => ({
          eventId: row.id,
          tenantId: row.tenant_id,
          incidentId: row.incident_id,
          eventType: (row.action as any) || "STEP_COMPLETED",
          actor: {
            type: "USER" as const,
            userId: row.actor_id,
            userName: row.actor_id,
          },
          details: typeof row.details === "string" ? JSON.parse(row.details) : (row.details || {}),
          timestamp: new Date(row.occurred_at).toISOString(),
        }));
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_AUDIT_STORE_UNAVAILABLE: ${(err as Error).message}`);
        }
      }
    }
    return [...this.memoryEvents];
  }
}
