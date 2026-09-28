/**
 * Alert Suppression Service
 *
 * Provides the authoritative gate that controls whether an alert for a given
 * (tenantId, branchId, cameraId, detectionType) tuple should be suppressed.
 *
 * Suppression is evaluated in precedence order (most-specific wins):
 *   Camera-level > Branch-level > Global-tenant-level
 * Within each level, detection-type-specific wins over "all types" (null).
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { pool as globalPool } from "../../database/pool.js";

export interface SuppressionConfig {
  id: string;
  tenantId: string;
  branchId: string | null;
  cameraId: string | null;
  detectionType: string | null;
  suppressed: boolean;
  label: string;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
}

export interface ToggleSuppressionInput {
  tenantId: string;
  branchId?: string | null;
  cameraId?: string | null;
  detectionType?: string | null;
  suppressed: boolean;
  label?: string;
  updatedBy: string;
  reason?: string;
}

export interface SuppressionCheckResult {
  suppressed: boolean;
  matchedScope: "camera" | "branch" | "global" | "none";
  matchedDetectionType: string | null;
  configId: string | null;
}

function mapRow(row: Record<string, any>): SuppressionConfig {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id ?? null,
    cameraId: row.camera_id ?? null,
    detectionType: row.detection_type ?? null,
    suppressed: row.suppressed,
    label: row.label,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export class AlertSuppressionService {
  private readonly db: Pool;

  constructor(pool?: Pool) {
    const p = pool || globalPool;
    if (!p) {
      throw new Error("AlertSuppressionService requires a PostgreSQL pool.");
    }
    this.db = p;
  }

  // ─────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────

  /**
   * List all suppression configs for a tenant, optionally filtered by branch/camera.
   */
  async listConfigs(
    tenantId: string,
    opts: { branchId?: string; cameraId?: string } = {}
  ): Promise<SuppressionConfig[]> {
    let query = `
      SELECT * FROM alert_suppression_config
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];
    let idx = 2;

    if (opts.branchId) {
      query += ` AND (branch_id = $${idx} OR branch_id IS NULL)`;
      params.push(opts.branchId);
      idx++;
    }
    if (opts.cameraId) {
      query += ` AND (camera_id = $${idx} OR camera_id IS NULL)`;
      params.push(opts.cameraId);
      idx++;
    }

    query += ` ORDER BY
      CASE WHEN camera_id IS NOT NULL THEN 0
           WHEN branch_id IS NOT NULL THEN 1
           ELSE 2 END,
      CASE WHEN detection_type IS NOT NULL THEN 0 ELSE 1 END,
      updated_at DESC`;

    const res = await this.db.query(query, params);
    return res.rows.map(mapRow);
  }

  /**
   * Get a single suppression config by ID.
   */
  async getConfig(id: string): Promise<SuppressionConfig | null> {
    const res = await this.db.query(
      `SELECT * FROM alert_suppression_config WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  /**
   * Authoritative ingest-time check: should this alert be suppressed?
   *
   * Returns the most-specific matching suppression rule (camera > branch > global).
   */
  async isSuppressed(
    tenantId: string,
    branchId: string,
    cameraId: string | null | undefined,
    detectionType: string
  ): Promise<SuppressionCheckResult> {
    // Pull the single most-specific candidate config for this tuple.
    const res = await this.db.query<Record<string, any>>(
      `SELECT *
       FROM alert_suppression_config
       WHERE tenant_id = $1
         AND (branch_id = $2 OR branch_id IS NULL)
         AND (camera_id = $3 OR camera_id IS NULL)
         AND (detection_type = $4 OR detection_type IS NULL)
       ORDER BY
         CASE WHEN camera_id IS NOT NULL THEN 0
              WHEN branch_id IS NOT NULL THEN 1
              ELSE 2 END,
         CASE WHEN detection_type IS NOT NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      [tenantId, branchId, cameraId ?? null, detectionType]
    );

    if (!res.rows[0]) {
      return { suppressed: false, matchedScope: "none", matchedDetectionType: null, configId: null };
    }

    const cfg = mapRow(res.rows[0]);
    const scope: SuppressionCheckResult["matchedScope"] =
      cfg.cameraId ? "camera" : cfg.branchId ? "branch" : "global";

    // If the most-specific matching rule says suppressed = false, it explicitly activates this scope,
    // overriding any broader suppression rule (e.g. active camera within a suppressed branch).
    if (!cfg.suppressed) {
      return {
        suppressed: false,
        matchedScope: scope,
        matchedDetectionType: cfg.detectionType,
        configId: cfg.id,
      };
    }

    return {
      suppressed: true,
      matchedScope: scope,
      matchedDetectionType: cfg.detectionType,
      configId: cfg.id,
    };
  }

  // ─────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────

  /**
   * Upsert a suppression toggle. Creates if not exists, updates if it does.
   * Returns the resulting config.
   */
  async upsertSuppression(input: ToggleSuppressionInput): Promise<SuppressionConfig> {
    const now = new Date().toISOString();
    const label =
      input.label ??
      (input.detectionType
        ? this.labelFromDetectionType(input.detectionType)
        : input.cameraId
        ? "All alerts for this camera"
        : input.branchId
        ? "All alerts for this branch"
        : "All alerts (global)");

    const res = await this.db.query<Record<string, any>>(
      `INSERT INTO alert_suppression_config
         (id, tenant_id, branch_id, camera_id, detection_type, suppressed, label, updated_by, updated_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT ON CONSTRAINT alert_suppression_scope_unique DO UPDATE
         SET suppressed  = EXCLUDED.suppressed,
             label       = EXCLUDED.label,
             updated_by  = EXCLUDED.updated_by,
             updated_at  = EXCLUDED.updated_at
       RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.branchId ?? null,
        input.cameraId ?? null,
        input.detectionType ?? null,
        input.suppressed,
        label,
        input.updatedBy,
        now,
      ]
    );

    if (!res.rows[0]) {
      throw new Error("Failed to persist suppression configuration");
    }
    const config = mapRow(res.rows[0]);

    // Write audit trail
    await this.db.query(
      `INSERT INTO alert_suppression_audit
         (id, suppression_id, tenant_id, branch_id, camera_id, detection_type, suppressed, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        randomUUID(),
        config.id,
        input.tenantId,
        input.branchId ?? null,
        input.cameraId ?? null,
        input.detectionType ?? null,
        input.suppressed,
        input.updatedBy,
        input.reason ?? null,
      ]
    ).catch(() => { /* audit failures must never block the toggle */ });

    return config;
  }

  /**
   * Bulk toggle: suppress or activate ALL detection types for a given scope in one call.
   */
  async bulkToggle(
    tenantId: string,
    suppressed: boolean,
    updatedBy: string,
    scope: { branchId?: string | null; cameraId?: string | null } = {},
    reason?: string
  ): Promise<SuppressionConfig> {
    return this.upsertSuppression({
      tenantId,
      branchId: scope.branchId ?? null,
      cameraId: scope.cameraId ?? null,
      detectionType: null,  // null = all types
      suppressed,
      updatedBy,
      reason,
    });
  }

  /**
   * Delete a specific suppression config (restores alert generation).
   */
  async deleteConfig(id: string, tenantId: string): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM alert_suppression_config WHERE id = $1 AND tenant_id = $2 RETURNING id`,
      [id, tenantId]
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Get the audit trail for a given suppression config.
   */
  async getAuditLog(suppressionId: string, tenantId: string): Promise<any[]> {
    const res = await this.db.query(
      `SELECT * FROM alert_suppression_audit
       WHERE suppression_id = $1 AND tenant_id = $2
       ORDER BY changed_at DESC
       LIMIT 50`,
      [suppressionId, tenantId]
    );
    return res.rows;
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

  private labelFromDetectionType(dt: string): string {
    const map: Record<string, string> = {
      INTRUSION: "Intrusion Detection",
      FIRE: "Fire Detection",
      SMOKE: "Smoke Detection",
      CAMERA_TAMPER: "Camera Tamper",
      VAULT_ACCESS: "Vault Access",
      LOITERING: "Loitering",
      CROWD_GATHERING: "Crowd Gathering",
      BLACKLIST_PERSON: "Watchlist Person",
      VEHICLE_ANPR: "ANPR / Vehicle",
      VIOLENCE: "Violence Detection",
      CAMERA_OBSTRUCTION: "Camera Obstruction",
      ATM_VANDALISM: "ATM Vandalism",
      WEAPON_DETECTED: "Weapon Detection",
      CASH_VAN_MONITORING: "Cash Van Monitoring",
      QUEUE_ANOMALY: "Queue Anomaly",
      CAMERA_HEALTH_FAULT: "Camera Health Fault",
    };
    return map[dt] ?? dt;
  }
}
