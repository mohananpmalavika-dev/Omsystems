/**
 * Durable Alert Repository
 * 
 * PostgreSQL-backed authoritative datastore for alert lifecycle states,
 * with optimistic concurrency version checking and atomic operator claiming.
 */

import type { Pool } from "pg";
import type { DurableAlert, AlertActionRecord, DurableAlertStatus } from "../domain/monitoring-queue.types.js";

export class DurableAlertRepository {
  private inMemoryAlerts: Map<string, DurableAlert> = new Map();
  private inMemoryActions: AlertActionRecord[] = [];

  constructor(private readonly pool?: Pool | undefined) {}

  async create(alert: Omit<DurableAlert, "version" | "createdAt" | "updatedAt">): Promise<DurableAlert> {
    const full: DurableAlert = {
      ...alert,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO alerts (
          id, event_id, tenant_id, branch_id, camera_id, recorder_id,
          alert_type, severity, status, title, description, detected_at,
          assigned_operator_id, escalation_level, sla_due_at, version,
          created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          full.id,
          full.eventId,
          full.tenantId,
          full.branchId,
          full.cameraId ?? null,
          full.recorderId ?? null,
          full.alertType,
          full.severity,
          full.status,
          full.title,
          full.description ?? null,
          full.detectedAt,
          full.assignedOperatorId ?? null,
          full.escalationLevel,
          full.slaDueAt ?? null,
          full.version,
          full.createdAt,
          full.updatedAt,
        ]
      );
    } else {
      this.inMemoryAlerts.set(full.id, full);
    }

    await this.recordAction({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alertId: full.id,
      action: "CREATED",
      actorType: "SYSTEM",
      newStatus: full.status,
      createdAt: new Date(),
    });

    return full;
  }

  async findById(alertId: string): Promise<DurableAlert | undefined> {
    if (this.pool) {
      const res = await this.pool.query("SELECT * FROM alerts WHERE id = $1", [alertId]);
      if (res.rowCount === 0) return undefined;
      return this.mapRow(res.rows[0]);
    }
    return this.inMemoryAlerts.get(alertId);
  }

  async findActive(tenantId: string, operatorId?: string | undefined): Promise<DurableAlert[]> {
    if (this.pool) {
      let query = `
        SELECT * FROM alerts
        WHERE tenant_id = $1
          AND status IN ('NEW', 'QUEUED', 'ASSIGNED', 'ACKNOWLEDGED', 'INVESTIGATING')
      `;
      const params: any[] = [tenantId];
      if (operatorId) {
        query += " AND (assigned_operator_id = $2 OR assigned_operator_id IS NULL)";
        params.push(operatorId);
      }
      query += `
        ORDER BY
          CASE severity
            WHEN 'P1' THEN 1
            WHEN 'P2' THEN 2
            WHEN 'P3' THEN 3
            WHEN 'P4' THEN 4
          END ASC,
          detected_at ASC;
      `;
      const res = await this.pool.query(query, params);
      return res.rows.map((r) => this.mapRow(r));
    }

    return Array.from(this.inMemoryAlerts.values())
      .filter(
        (a) =>
          a.tenantId === tenantId &&
          ["NEW", "QUEUED", "ASSIGNED", "ACKNOWLEDGED", "INVESTIGATING"].includes(a.status) &&
          (!operatorId || !a.assignedOperatorId || a.assignedOperatorId === operatorId)
      )
      .sort((a, b) => {
        const sevOrder = { P1: 1, P2: 2, P3: 3, P4: 4 };
        return (sevOrder[a.severity] || 5) - (sevOrder[b.severity] || 5);
      });
  }

  /**
   * Atomic alert claiming: Only one operator can transition from NEW/QUEUED to ASSIGNED.
   */
  async claimAlert(alertId: string, operatorId: string): Promise<DurableAlert | null> {
    const now = new Date();
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE alerts
         SET status = 'ASSIGNED',
             assigned_operator_id = $1,
             updated_at = $2,
             version = version + 1
         WHERE id = $3 AND status IN ('NEW', 'QUEUED')
         RETURNING *;`,
        [operatorId, now, alertId]
      );
      if (res.rowCount === 0) return null;
      const updated = this.mapRow(res.rows[0]);
      await this.recordAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        alertId,
        action: "CLAIMED",
        actorType: "OPERATOR",
        actorId: operatorId,
        previousStatus: "QUEUED",
        newStatus: "ASSIGNED",
        createdAt: now,
      });
      return updated;
    } else {
      const alert = this.inMemoryAlerts.get(alertId);
      if (!alert || !["NEW", "QUEUED"].includes(alert.status)) {
        return null;
      }
      const prevStatus = alert.status;
      alert.status = "ASSIGNED";
      alert.assignedOperatorId = operatorId;
      alert.version += 1;
      alert.updatedAt = now;

      await this.recordAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        alertId,
        action: "CLAIMED",
        actorType: "OPERATOR",
        actorId: operatorId,
        previousStatus: prevStatus,
        newStatus: "ASSIGNED",
        createdAt: now,
      });
      return alert;
    }
  }

  /**
   * Optimistic concurrency acknowledgment with version check.
   */
  async acknowledge(alertId: string, operatorId: string, expectedVersion?: number | undefined): Promise<DurableAlert | null> {
    const now = new Date();
    if (this.pool) {
      let query = `
        UPDATE alerts
        SET status = 'ACKNOWLEDGED',
            acknowledged_by = $1,
            acknowledged_at = $2,
            updated_at = $2,
            version = version + 1
        WHERE id = $3
      `;
      const params: any[] = [operatorId, now, alertId];
      if (expectedVersion !== undefined) {
        query += " AND version = $4";
        params.push(expectedVersion);
      }
      query += " RETURNING *;";
      const res = await this.pool.query(query, params);
      if (res.rowCount === 0) return null;
      const updated = this.mapRow(res.rows[0]);
      await this.recordAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        alertId,
        action: "ACKNOWLEDGED",
        actorType: "OPERATOR",
        actorId: operatorId,
        newStatus: "ACKNOWLEDGED",
        createdAt: now,
      });
      return updated;
    } else {
      const alert = this.inMemoryAlerts.get(alertId);
      if (!alert) return null;
      if (expectedVersion !== undefined && alert.version !== expectedVersion) {
        return null; // Version conflict
      }
      const prevStatus = alert.status;
      alert.status = "ACKNOWLEDGED";
      alert.acknowledgedBy = operatorId;
      alert.acknowledgedAt = now;
      alert.version += 1;
      alert.updatedAt = now;

      await this.recordAction({
        id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        alertId,
        action: "ACKNOWLEDGED",
        actorType: "OPERATOR",
        actorId: operatorId,
        previousStatus: prevStatus,
        newStatus: "ACKNOWLEDGED",
        createdAt: now,
      });
      return alert;
    }
  }

  async findUnqueuedActive(): Promise<DurableAlert[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM alerts WHERE status IN ('NEW', 'QUEUED') ORDER BY detected_at ASC`
      );
      return res.rows.map((r) => this.mapRow(r));
    }
    return Array.from(this.inMemoryAlerts.values()).filter((a) => ["NEW", "QUEUED"].includes(a.status));
  }

  async recordAction(action: AlertActionRecord): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO alert_actions (
          id, alert_id, action, actor_type, actor_id, previous_status, new_status, reason, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          action.id,
          action.alertId,
          action.action,
          action.actorType,
          action.actorId ?? null,
          action.previousStatus ?? null,
          action.newStatus ?? null,
          action.reason ?? null,
          JSON.stringify(action.metadata || {}),
          action.createdAt,
        ]
      );
    } else {
      this.inMemoryActions.push(action);
    }
  }

  async getActionsForAlert(alertId: string): Promise<AlertActionRecord[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM alert_actions WHERE alert_id = $1 ORDER BY created_at ASC`,
        [alertId]
      );
      return res.rows.map((r) => ({
        id: r.id,
        alertId: r.alert_id,
        action: r.action,
        actorType: r.actor_type,
        actorId: r.actor_id,
        previousStatus: r.previous_status,
        newStatus: r.new_status,
        reason: r.reason,
        metadata: r.metadata,
        createdAt: r.created_at,
      }));
    }
    return this.inMemoryActions.filter((a) => a.alertId === alertId);
  }

  private mapRow(row: any): DurableAlert {
    return {
      id: row.id,
      eventId: row.event_id,
      tenantId: row.tenant_id,
      branchId: row.branch_id,
      cameraId: row.camera_id,
      recorderId: row.recorder_id,
      alertType: row.alert_type,
      severity: row.severity,
      status: row.status,
      title: row.title,
      description: row.description,
      detectedAt: row.detected_at,
      assignedOperatorId: row.assigned_operator_id,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      escalationLevel: row.escalation_level,
      slaDueAt: row.sla_due_at,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  clear() {
    this.inMemoryAlerts.clear();
    this.inMemoryActions = [];
  }
}

export const durableAlertRepository = new DurableAlertRepository();
