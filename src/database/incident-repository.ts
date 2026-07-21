import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export class IncidentRepository {
  constructor(private readonly pool: Pool) {}

  async createIncident(input: {
    tenantId: string;
    incidentNumber: string;
    title: string;
    description?: string;
    incidentType?: string;
    severity?: string;
    branchId?: string;
    occurredAt?: string;
    reportedBy?: string;
  }) {
    const result = await this.pool.query(
      `INSERT INTO incidents (
         id, tenant_id, incident_number, title, description, incident_type,
         severity, branch_id, occurred_at, reported_by, status, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new', now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.incidentNumber,
        input.title,
        input.description ?? null,
        input.incidentType ?? null,
        input.severity ?? null,
        input.branchId ?? null,
        input.occurredAt ?? null,
        input.reportedBy ?? null,
      ],
    );
    return mapIncident(result.rows[0]);
  }

  async getIncident(id: string) {
    const result = await this.pool.query(`SELECT * FROM incidents WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    return mapIncident(result.rows[0]);
  }

  async listIncidents(tenantId: string, filters?: { status?: string; limit?: number }) {
    const limit = filters?.limit ?? 100;
    if (filters?.status) {
      const res = await this.pool.query(
        `SELECT * FROM incidents WHERE tenant_id=$1 AND status=$2 ORDER BY detected_at DESC LIMIT $3`,
        [tenantId, filters.status, limit],
      );
      return res.rows.map(mapIncident);
    }
    const res = await this.pool.query(
      `SELECT * FROM incidents WHERE tenant_id=$1 ORDER BY detected_at DESC LIMIT $2`,
      [tenantId, limit],
    );
    return res.rows.map(mapIncident);
  }

  async updateStatus(id: string, status: string, changedBy?: string, notes?: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(
        `UPDATE incidents SET status=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [id, status],
      );
      await client.query(
        `INSERT INTO incident_status_history (id, incident_id, status, changed_by, notes, created_at) VALUES ($1,$2,$3,$4,$5,now())`,
        [randomUUID(), id, status, changedBy ?? null, notes ?? null],
      );
      await client.query("COMMIT");
      return upd.rows[0] ? mapIncident(upd.rows[0]) : undefined;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async assignIncident(id: string, userId: string) {
    const res = await this.pool.query(
      `UPDATE incidents SET assigned_to=$2, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, userId],
    );
    return res.rows[0] ? mapIncident(res.rows[0]) : undefined;
  }

  async addCamera(incidentId: string, cameraId: string) {
    await this.pool.query(
      `INSERT INTO incident_cameras (id, incident_id, camera_id, added_at) VALUES ($1,$2,$3,now())`,
      [randomUUID(), incidentId, cameraId],
    );
  }

  async addVideoRange(incidentId: string, cameraId: string, fromAt: string, toAt: string) {
    const res = await this.pool.query(
      `INSERT INTO incident_video_ranges (id, incident_id, camera_id, from_at, to_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [randomUUID(), incidentId, cameraId, fromAt, toAt],
    );
    return res.rows[0];
  }

  async listTimeline(incidentId: string) {
    const res = await this.pool.query(
      `SELECT * FROM incident_events WHERE incident_id=$1 ORDER BY created_at ASC`,
      [incidentId],
    );
    return res.rows;
  }

  async addEvent(incidentId: string, eventType: string, details: any, createdBy?: string) {
    const res = await this.pool.query(
      `INSERT INTO incident_events (id, incident_id, event_type, details, created_by, created_at) VALUES ($1,$2,$3,$4,$5,now()) RETURNING *`,
      [randomUUID(), incidentId, eventType, JSON.stringify(details ?? {}), createdBy ?? null],
    );
    return res.rows[0];
  }
}

function mapIncident(row: any) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    incidentNumber: row.incident_number,
    title: row.title,
    description: row.description ?? undefined,
    incidentType: row.incident_type ?? undefined,
    severity: row.severity ?? undefined,
    branchId: row.branch_id ?? undefined,
    occurredAt: row.occurred_at?.toISOString(),
    detectedAt: row.detected_at?.toISOString(),
    reportedBy: row.reported_by ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    status: row.status,
    legalHoldId: row.legal_hold_id ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at?.toISOString(),
  };
}

export default IncidentRepository;
