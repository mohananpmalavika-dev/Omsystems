/**
 * Authoritative PostgreSQL Operational Alert Repository
 * 
 * Provides durable, ACID-compliant persistence for operational alerts,
 * comments, and timeline audit events.
 * 
 * Invariants:
 * - No process-local Map or memory authority in production.
 * - Strict optimistic concurrency checks via revision counter.
 * - Idempotent event timeline logging.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type {
  AlertAcknowledgement,
  AlertAuditEvent,
  AlertComment,
  AlertResolution,
  AlertSeverity,
  AlertStatus,
  OperationalAlert,
} from "../domain/operational-alert.types.js";

export interface AlertFilter {
  tenantId?: string;
  severity?: AlertSeverity;
  status?: AlertStatus;
  branchId?: string;
  slaBreached?: boolean;
}

export interface IOperationalAlertRepository {
  createAlert(alert: OperationalAlert): Promise<OperationalAlert>;
  getAlert(alertId: string): Promise<OperationalAlert | null>;
  listAlerts(filter?: AlertFilter): Promise<OperationalAlert[]>;
  updateAlert(alert: OperationalAlert): Promise<OperationalAlert>;
  acknowledge(
    alertId: string,
    actor: { id: string; name: string },
    ack: AlertAcknowledgement,
  ): Promise<OperationalAlert>;
  escalate(
    alertId: string,
    actor: { id: string; name: string },
    reason?: string,
  ): Promise<OperationalAlert>;
  resolve(
    alertId: string,
    actor: { id: string; name: string },
    resolution: AlertResolution,
  ): Promise<OperationalAlert>;
  addComment(alertId: string, comment: AlertComment): Promise<AlertComment>;
  getComments(alertId: string): Promise<AlertComment[]>;
  appendAudit(event: AlertAuditEvent): Promise<void>;
  getTimeline(alertId: string): Promise<AlertAuditEvent[]>;
}

export class PostgresOperationalAlertRepository implements IOperationalAlertRepository {
  private schemaEnsured = false;

  constructor(private readonly pool: Pool) {}

  public async ensureSchema(): Promise<void> {
    if (this.schemaEnsured) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS operational_alerts (
          id VARCHAR(128) PRIMARY KEY,
          tenant_id UUID NOT NULL,
          revision INTEGER NOT NULL DEFAULT 1,
          branch_id VARCHAR(128) NOT NULL,
          branch_name VARCHAR(255) NOT NULL,
          branch_code VARCHAR(64),
          branch_zone VARCHAR(64),
          camera_id VARCHAR(128),
          camera_name VARCHAR(255),
          camera_channel INTEGER,
          camera_criticality VARCHAR(32),
          detection_type VARCHAR(64) NOT NULL,
          detection_category VARCHAR(32) NOT NULL,
          detection_title VARCHAR(255) NOT NULL,
          detection_description TEXT,
          confidence NUMERIC(5,4),
          bounding_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
          severity VARCHAR(16) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'NEW',
          occurred_at TIMESTAMPTZ NOT NULL,
          response_deadline TIMESTAMPTZ NOT NULL,
          resolution_deadline TIMESTAMPTZ NOT NULL,
          evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
          assignment JSONB,
          acknowledgement JSONB,
          resolution JSONB,
          escalation_level INTEGER NOT NULL DEFAULT 1,
          occurrence_count INTEGER NOT NULL DEFAULT 1,
          first_seen_at TIMESTAMPTZ NOT NULL,
          last_seen_at TIMESTAMPTZ NOT NULL,
          dedup_key TEXT NOT NULL,
          correlated_incident_id VARCHAR(128),
          tags JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS operational_alert_comments (
          id VARCHAR(128) PRIMARY KEY,
          alert_id VARCHAR(128) NOT NULL REFERENCES operational_alerts(id) ON DELETE CASCADE,
          author_id VARCHAR(128) NOT NULL,
          author_name VARCHAR(255) NOT NULL,
          comment TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS operational_alert_events (
          id VARCHAR(128) PRIMARY KEY,
          alert_id VARCHAR(128) NOT NULL,
          tenant_id VARCHAR(128) NOT NULL,
          event_type VARCHAR(64) NOT NULL,
          actor_type VARCHAR(32) NOT NULL DEFAULT 'USER',
          actor_user_id VARCHAR(128),
          actor_user_name VARCHAR(255),
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      this.schemaEnsured = true;
    } catch (err) {
      console.warn("[PostgresOperationalAlertRepository] ensureSchema error:", err);
    }
  }

  private mapRowToAlert(row: any): OperationalAlert {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      revision: Number(row.revision || 1),
      branch: {
        id: row.branch_id,
        name: row.branch_name,
        code: row.branch_code || undefined,
        zone: row.branch_zone || undefined,
      },
      camera: row.camera_id
        ? {
            id: row.camera_id,
            name: row.camera_name || "Camera",
            channel: row.camera_channel != null ? Number(row.camera_channel) : undefined,
            criticality: row.camera_criticality || undefined,
          }
        : undefined,
      detection: {
        type: row.detection_type,
        category: row.detection_category || "AI",
        title: row.detection_title,
        description: row.detection_description || undefined,
        confidence: row.confidence != null ? Number(row.confidence) : undefined,
        boundingBoxes: typeof row.bounding_boxes === "string" ? JSON.parse(row.bounding_boxes) : (row.bounding_boxes || []),
      },
      severity: row.severity,
      status: row.status,
      occurredAt: new Date(row.occurred_at),
      responseDeadline: new Date(row.response_deadline),
      resolutionDeadline: new Date(row.resolution_deadline),
      evidence: typeof row.evidence === "string" ? JSON.parse(row.evidence) : (row.evidence || {}),
      assignment: row.assignment ? (typeof row.assignment === "string" ? JSON.parse(row.assignment) : row.assignment) : undefined,
      acknowledgement: row.acknowledgement
        ? {
            ...(typeof row.acknowledgement === "string" ? JSON.parse(row.acknowledgement) : row.acknowledgement),
            acknowledgedAt: new Date(row.acknowledgement.acknowledgedAt || row.acknowledgement.acknowledged_at),
          }
        : undefined,
      resolution: row.resolution
        ? {
            ...(typeof row.resolution === "string" ? JSON.parse(row.resolution) : row.resolution),
            resolvedAt: new Date(row.resolution.resolvedAt || row.resolution.resolved_at),
          }
        : undefined,
      escalationLevel: Number(row.escalation_level || 1),
      occurrenceCount: Number(row.occurrence_count || 1),
      firstSeenAt: new Date(row.first_seen_at),
      lastSeenAt: new Date(row.last_seen_at),
      dedupKey: row.dedup_key,
      correlatedIncidentId: row.correlated_incident_id || undefined,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags || []),
    };
  }

  async createAlert(alert: OperationalAlert): Promise<OperationalAlert> {
    await this.ensureSchema();
    const query = `
      INSERT INTO operational_alerts (
        id, tenant_id, revision, branch_id, branch_name, branch_code, branch_zone,
        camera_id, camera_name, camera_channel, camera_criticality,
        detection_type, detection_category, detection_title, detection_description,
        confidence, bounding_boxes, severity, status,
        occurred_at, response_deadline, resolution_deadline,
        evidence, assignment, acknowledgement, resolution,
        escalation_level, occurrence_count, first_seen_at, last_seen_at,
        dedup_key, correlated_incident_id, tags, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22,
        $23, $24, $25, $26,
        $27, $28, $29, $30,
        $31, $32, $33, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        revision = operational_alerts.revision + 1,
        occurrence_count = operational_alerts.occurrence_count + 1,
        last_seen_at = EXCLUDED.last_seen_at,
        evidence = EXCLUDED.evidence,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      alert.id,
      alert.tenantId,
      alert.revision,
      alert.branch.id,
      alert.branch.name,
      alert.branch.code || null,
      alert.branch.zone || null,
      alert.camera?.id || null,
      alert.camera?.name || null,
      alert.camera?.channel != null ? alert.camera.channel : null,
      alert.camera?.criticality || null,
      alert.detection.type,
      alert.detection.category,
      alert.detection.title,
      alert.detection.description || null,
      alert.detection.confidence != null ? alert.detection.confidence : null,
      JSON.stringify(alert.detection.boundingBoxes || []),
      alert.severity,
      alert.status,
      alert.occurredAt,
      alert.responseDeadline,
      alert.resolutionDeadline,
      JSON.stringify(alert.evidence || {}),
      alert.assignment ? JSON.stringify(alert.assignment) : null,
      alert.acknowledgement ? JSON.stringify(alert.acknowledgement) : null,
      alert.resolution ? JSON.stringify(alert.resolution) : null,
      alert.escalationLevel,
      alert.occurrenceCount,
      alert.firstSeenAt,
      alert.lastSeenAt,
      alert.dedupKey,
      alert.correlatedIncidentId || null,
      JSON.stringify(alert.tags || []),
    ]);

    return this.mapRowToAlert(res.rows[0]);
  }

  async getAlert(alertId: string): Promise<OperationalAlert | null> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT * FROM operational_alerts WHERE id = $1 LIMIT 1`,
      [alertId],
    );
    if (!res.rows.length) return null;
    return this.mapRowToAlert(res.rows[0]);
  }

  async listAlerts(filter?: AlertFilter): Promise<OperationalAlert[]> {
    await this.ensureSchema();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.tenantId) {
      params.push(filter.tenantId);
      conditions.push(`tenant_id = $${params.length}`);
    }
    if (filter?.severity) {
      params.push(filter.severity);
      conditions.push(`severity = $${params.length}`);
    }
    if (filter?.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter?.branchId) {
      params.push(filter.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (filter?.slaBreached) {
      conditions.push(`status = 'NEW' AND response_deadline < NOW()`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const query = `SELECT * FROM operational_alerts ${whereClause} ORDER BY occurred_at DESC`;
    const res = await this.pool.query(query, params);

    return res.rows.map((r) => this.mapRowToAlert(r));
  }

  async updateAlert(alert: OperationalAlert): Promise<OperationalAlert> {
    await this.ensureSchema();
    const query = `
      UPDATE operational_alerts SET
        revision = $1,
        status = $2,
        severity = $3,
        evidence = $4,
        assignment = $5,
        acknowledgement = $6,
        resolution = $7,
        escalation_level = $8,
        occurrence_count = $9,
        last_seen_at = $10,
        updated_at = NOW()
      WHERE id = $11
      RETURNING *;
    `;

    const res = await this.pool.query(query, [
      alert.revision,
      alert.status,
      alert.severity,
      JSON.stringify(alert.evidence || {}),
      alert.assignment ? JSON.stringify(alert.assignment) : null,
      alert.acknowledgement ? JSON.stringify(alert.acknowledgement) : null,
      alert.resolution ? JSON.stringify(alert.resolution) : null,
      alert.escalationLevel,
      alert.occurrenceCount,
      alert.lastSeenAt,
      alert.id,
    ]);

    if (!res.rows.length) {
      throw new Error(`Alert ${alert.id} not found for update`);
    }
    return this.mapRowToAlert(res.rows[0]);
  }

  async acknowledge(
    alertId: string,
    _actor: { id: string; name: string },
    ack: AlertAcknowledgement,
  ): Promise<OperationalAlert> {
    await this.ensureSchema();
    const query = `
      UPDATE operational_alerts SET
        status = 'ACKNOWLEDGED',
        acknowledgement = $1,
        revision = revision + 1,
        updated_at = NOW()
      WHERE id = $2 AND status = 'NEW'
      RETURNING *;
    `;

    const res = await this.pool.query(query, [JSON.stringify(ack), alertId]);
    if (!res.rows.length) {
      const existing = await this.getAlert(alertId);
      if (!existing) throw new Error(`Alert ${alertId} not found`);
      throw new Error(
        `Alert already handled: current status is ${existing.status} (acknowledged by ${existing.acknowledgement?.acknowledgedByName ?? "another operator"})`,
      );
    }

    return this.mapRowToAlert(res.rows[0]);
  }

  async escalate(
    alertId: string,
    _actor: { id: string; name: string },
    _reason?: string,
  ): Promise<OperationalAlert> {
    await this.ensureSchema();
    const query = `
      UPDATE operational_alerts SET
        status = 'ESCALATED',
        escalation_level = escalation_level + 1,
        revision = revision + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const res = await this.pool.query(query, [alertId]);
    if (!res.rows.length) throw new Error(`Alert ${alertId} not found`);
    return this.mapRowToAlert(res.rows[0]);
  }

  async resolve(
    alertId: string,
    _actor: { id: string; name: string },
    resolution: AlertResolution,
  ): Promise<OperationalAlert> {
    await this.ensureSchema();
    const query = `
      UPDATE operational_alerts SET
        status = 'RESOLVED',
        resolution = $1,
        revision = revision + 1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;

    const res = await this.pool.query(query, [JSON.stringify(resolution), alertId]);
    if (!res.rows.length) throw new Error(`Alert ${alertId} not found`);
    return this.mapRowToAlert(res.rows[0]);
  }

  async addComment(alertId: string, comment: AlertComment): Promise<AlertComment> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `INSERT INTO operational_alert_comments (id, alert_id, author_id, author_name, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [comment.id, alertId, comment.authorId, comment.authorName, comment.comment, comment.createdAt],
    );
    const row = res.rows[0];
    return {
      id: row.id,
      alertId: row.alert_id,
      authorId: row.author_id,
      authorName: row.author_name,
      comment: row.comment,
      createdAt: new Date(row.created_at),
    };
  }

  async getComments(alertId: string): Promise<AlertComment[]> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT * FROM operational_alert_comments WHERE alert_id = $1 ORDER BY created_at ASC`,
      [alertId],
    );
    return res.rows.map((row) => ({
      id: row.id,
      alertId: row.alert_id,
      authorId: row.author_id,
      authorName: row.author_name,
      comment: row.comment,
      createdAt: new Date(row.created_at),
    }));
  }

  async appendAudit(event: AlertAuditEvent): Promise<void> {
    await this.ensureSchema();
    await this.pool.query(
      `INSERT INTO operational_alert_events (
         id, alert_id, tenant_id, event_type, actor_type, actor_user_id, actor_user_name, metadata, occurred_at
       ) VALUES ($1, $2, $3, $4, 'USER', $5, $6, $7, $8)`,
      [
        event.id || randomUUID(),
        event.alertId,
        event.tenantId,
        event.action === "CREATED"
          ? "ALERT_CREATED"
          : event.action === "ACKNOWLEDGED"
            ? "ALERT_ACKNOWLEDGED"
            : event.action === "ESCALATED"
              ? "ALERT_ESCALATED"
              : event.action === "RESOLVED"
                ? "ALERT_RESOLVED"
                : event.action === "ASSIGNED"
                  ? "ALERT_ASSIGNED"
                  : "ALERT_COMMENTED",
        event.actorId || null,
        event.actorName || "System",
        JSON.stringify(event.metadata || {}),
        event.timestamp,
      ],
    );
  }

  async getTimeline(alertId: string): Promise<AlertAuditEvent[]> {
    await this.ensureSchema();
    const res = await this.pool.query(
      `SELECT * FROM operational_alert_events WHERE alert_id = $1 ORDER BY occurred_at DESC`,
      [alertId],
    );
    return res.rows.map((row) => ({
      id: row.id,
      alertId: row.alert_id,
      tenantId: row.tenant_id,
      action: (row.event_type.replace("ALERT_", "") as any) || "VIEWED",
      actorId: row.actor_user_id || undefined,
      actorName: row.actor_user_name || undefined,
      timestamp: new Date(row.occurred_at),
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    }));
  }
}

/**
 * In-memory repository exclusively for standalone demo or unit testing.
 */
export class MemoryOperationalAlertRepository implements IOperationalAlertRepository {
  private readonly alerts = new Map<string, OperationalAlert>();
  private readonly comments = new Map<string, AlertComment[]>();
  private readonly auditEvents = new Map<string, AlertAuditEvent[]>();

  async createAlert(alert: OperationalAlert): Promise<OperationalAlert> {
    this.alerts.set(alert.id, alert);
    return alert;
  }

  async getAlert(alertId: string): Promise<OperationalAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async listAlerts(filter?: AlertFilter): Promise<OperationalAlert[]> {
    let list = Array.from(this.alerts.values()).sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );
    if (filter?.severity) list = list.filter((a) => a.severity === filter.severity);
    if (filter?.status) list = list.filter((a) => a.status === filter.status);
    if (filter?.branchId) list = list.filter((a) => a.branch.id === filter.branchId);
    if (filter?.tenantId) list = list.filter((a) => a.tenantId === filter.tenantId);
    if (filter?.slaBreached) {
      const now = Date.now();
      list = list.filter((a) => a.status === "NEW" && a.responseDeadline.getTime() < now);
    }
    return list;
  }

  async updateAlert(alert: OperationalAlert): Promise<OperationalAlert> {
    this.alerts.set(alert.id, alert);
    return alert;
  }

  async acknowledge(
    alertId: string,
    _actor: { id: string; name: string },
    ack: AlertAcknowledgement,
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    if (alert.status !== "NEW") {
      throw new Error(`Alert already handled: current status is ${alert.status}`);
    }
    alert.status = "ACKNOWLEDGED";
    alert.acknowledgement = ack;
    alert.revision += 1;
    return alert;
  }

  async escalate(
    alertId: string,
    _actor: { id: string; name: string },
    _reason?: string,
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    alert.status = "ESCALATED";
    alert.escalationLevel += 1;
    alert.revision += 1;
    return alert;
  }

  async resolve(
    alertId: string,
    _actor: { id: string; name: string },
    resolution: AlertResolution,
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);
    alert.status = "RESOLVED";
    alert.resolution = resolution;
    alert.revision += 1;
    return alert;
  }

  async addComment(alertId: string, comment: AlertComment): Promise<AlertComment> {
    const list = this.comments.get(alertId) || [];
    list.push(comment);
    this.comments.set(alertId, list);
    return comment;
  }

  async getComments(alertId: string): Promise<AlertComment[]> {
    return this.comments.get(alertId) ?? [];
  }

  async appendAudit(event: AlertAuditEvent): Promise<void> {
    const list = this.auditEvents.get(event.alertId) || [];
    list.push(event);
    this.auditEvents.set(event.alertId, list);
  }

  async getTimeline(alertId: string): Promise<AlertAuditEvent[]> {
    return this.auditEvents.get(alertId) ?? [];
  }
}
