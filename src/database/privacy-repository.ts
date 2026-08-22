import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  CameraPrivacyControlInput,
  CameraPrivacyPurposeAssignmentInput,
  PrivacyBreachInput,
  PrivacyPurposeInput,
} from "../control-plane-store.js";

type JsonRecord = Record<string, unknown>;

type PrivacySummary = {
  activePurposes: number;
  totalPurposes: number;
  assignedPurposes: number;
  totalControls: number;
  openBreaches: number;
};

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelRow<T = JsonRecord>(row: JsonRecord): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelKey(key),
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

function camelRows<T = JsonRecord>(rows: JsonRecord[]): T[] {
  return rows.map((row) => camelRow<T>(row));
}

export class PrivacyRepository {
  constructor(private readonly pool: Pool) {}

  async getPrivacySummary(tenantId: string) {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE active) AS active_purposes,
         COUNT(*) AS total_purposes,
         (SELECT COUNT(*) FROM camera_privacy_purpose_assignments WHERE camera_id IN (
            SELECT id FROM cameras WHERE branch_node_id IN (
              SELECT id FROM resource_nodes WHERE tenant_id = $1)
          )) AS assigned_purposes,
         (SELECT COUNT(*) FROM camera_privacy_controls WHERE camera_id IN (
              SELECT id FROM cameras WHERE branch_node_id IN (
                SELECT id FROM resource_nodes WHERE tenant_id = $1)
            )) AS total_controls,
         COUNT(*) FILTER (WHERE status <> 'closed') AS open_breaches
       FROM privacy_purposes
       WHERE tenant_id = $1`,
      [tenantId],
    );
    return camelRow<PrivacySummary>(result.rows[0] ?? {
      activePurposes: 0,
      totalPurposes: 0,
      assignedPurposes: 0,
      totalControls: 0,
      openBreaches: 0,
    });
  }

  async listPrivacyPurposes(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM privacy_purposes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return camelRows(result.rows);
  }

  async getPrivacyPurpose(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM privacy_purposes WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createPrivacyPurpose(input: PrivacyPurposeInput) {
    const result = await this.pool.query(
      `INSERT INTO privacy_purposes (
         id, tenant_id, name, lawful_basis, description,
         risk_level, data_categories, active, created_by,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.name,
        input.lawfulBasis,
        input.description ?? null,
        input.riskLevel,
        JSON.stringify(input.dataCategories ?? []),
        input.active ?? true,
        input.createdBy ?? null,
      ],
    );
    return camelRow(result.rows[0]);
  }

  async updatePrivacyPurpose(id: string, input: Partial<PrivacyPurposeInput>) {
    const values: Array<[string, unknown]> = [];
    
    if (input.tenantId !== undefined) values.push(["tenant_id", input.tenantId]);
    if (input.name !== undefined) values.push(["name", input.name]);
    if (input.lawfulBasis !== undefined) values.push(["lawful_basis", input.lawfulBasis]);
    if (input.description !== undefined) values.push(["description", input.description]);
    if (input.riskLevel !== undefined) values.push(["risk_level", input.riskLevel]);
    if (input.dataCategories !== undefined) values.push(["data_categories", JSON.stringify(input.dataCategories)]);
    if (input.active !== undefined) values.push(["active", input.active]);
    if (input.createdBy !== undefined) values.push(["created_by", input.createdBy]);

    if (values.length === 0) return this.getPrivacyPurpose(id);

    const assignments = values.map(([key], index) => `${key} = $${index + 2}`);
    const params = values.map(([, value]) => value);
    const result = await this.pool.query(
      `UPDATE privacy_purposes SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async listCameraPrivacyPurposes(cameraId: string) {
    const result = await this.pool.query(
      `SELECT cppa.* FROM camera_privacy_purpose_assignments cppa
       JOIN privacy_purposes pp ON pp.id = cppa.purpose_id
       WHERE cppa.camera_id = $1
       ORDER BY cppa.created_at DESC`,
      [cameraId],
    );
    return camelRows(result.rows);
  }

  async assignCameraPrivacyPurpose(
    cameraId: string,
    purposeId: string,
    createdBy: string,
    startDate?: string,
    endDate?: string,
    notes?: string,
  ) {
    const result = await this.pool.query(
      `INSERT INTO camera_privacy_purpose_assignments (
         id, camera_id, purpose_id, start_date, end_date,
         notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`,
      [
        randomUUID(),
        cameraId,
        purposeId,
        startDate ?? null,
        endDate ?? null,
        notes ?? null,
        createdBy,
      ],
    );
    return camelRow(result.rows[0]);
  }

  async getCameraPrivacyControls(cameraId: string) {
    const result = await this.pool.query(
      `SELECT * FROM camera_privacy_controls WHERE camera_id = $1`,
      [cameraId],
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async upsertCameraPrivacyControls(cameraId: string, input: CameraPrivacyControlInput) {
    const result = await this.pool.query(
      `INSERT INTO camera_privacy_controls (
         id, camera_id, audio_recording_approved,
         encryption_enabled, disposal_plan, data_protection_officer,
         last_reviewed_at, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())
       ON CONFLICT (camera_id) DO UPDATE SET
         audio_recording_approved = EXCLUDED.audio_recording_approved,
         encryption_enabled = EXCLUDED.encryption_enabled,
         disposal_plan = EXCLUDED.disposal_plan,
         data_protection_officer = EXCLUDED.data_protection_officer,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         updated_at = now()
       RETURNING *`,
      [
        randomUUID(),
        cameraId,
        input.audioRecordingApproved ?? false,
        input.encryptionEnabled ?? false,
        input.disposalPlan ?? null,
        input.dataProtectionOfficer ?? null,
        input.lastReviewedAt ?? null,
        null,
      ],
    );
    return camelRow(result.rows[0]);
  }

  async listPrivacyBreaches(tenantId: string, status?: string) {
    const result = await this.pool.query(
      `SELECT * FROM privacy_breaches
       WHERE tenant_id = $1
         AND ($2::privacy_breach_status IS NULL OR status = $2)
       ORDER BY discovered_at DESC`,
      [tenantId, status ?? null],
    );
    return camelRows(result.rows);
  }

  async reportPrivacyBreach(input: PrivacyBreachInput) {
    const result = await this.pool.query(
      `INSERT INTO privacy_breaches (
         id, tenant_id, branch_node_id, camera_id, breach_type,
         severity, discovered_at, description, remediation,
         created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.branchNodeId ?? null,
        input.cameraId ?? null,
        input.breachType,
        input.severity,
        input.discoveredAt,
        input.description ?? null,
        input.remediation ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow(result.rows[0]);
  }

  async updatePrivacyBreachStatus(id: string, status: string, changedBy: string) {
    const result = await this.pool.query(
      `UPDATE privacy_breaches SET status = $2, updated_at = now(), created_by = $3 WHERE id = $1 RETURNING *`,
      [id, status, changedBy],
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }
}
