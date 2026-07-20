import type { Pool } from "pg";
import type { AuditEventInput } from "../domain/models.js";

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async write(event: AuditEventInput) {
    await this.pool.query(
      `INSERT INTO audit_events
         (tenant_id, actor_user_id, action, resource_node_id, outcome,
          source_ip, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        event.tenantId,
        event.actorUserId,
        event.action,
        event.resourceNodeId,
        event.outcome,
        event.sourceIp ?? null,
        JSON.stringify(event.details ?? {}),
      ],
    );
  }
}
