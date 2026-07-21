import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  ComplianceAssessmentFilters,
  ComplianceAssessmentInput,
  ComplianceCertificateInput,
  ComplianceFrameworkInput,
  CompliancePolicyInput,
} from "../control-plane-store.js";
import type {
  ComplianceAssessment,
  ComplianceCertificate,
  ComplianceFramework,
  CompliancePolicy,
} from "../domain/models.js";

type JsonRecord = Record<string, unknown>;

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

function buildUpdateStatement(values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
  const params = entries.map(([, value]) => value);
  return { assignments, params };
}

export class ComplianceRepository {
  constructor(private readonly pool: Pool) {}

  async listFrameworks(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_frameworks WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return camelRows<ComplianceFramework>(result.rows);
  }

  async getFramework(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_frameworks WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<ComplianceFramework>(result.rows[0]);
  }

  async createFramework(input: ComplianceFrameworkInput) {
    const result = await this.pool.query(
      `INSERT INTO compliance_frameworks (
         id, tenant_id, name, source, description, status,
         effective_date, review_date, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.name,
        input.source ?? null,
        input.description ?? null,
        input.status ?? "active",
        input.effectiveDate ?? null,
        input.reviewDate ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<ComplianceFramework>(result.rows[0]);
  }

  async updateFramework(id: string, input: ComplianceFrameworkInput) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      name: input.name,
      source: input.source ?? null,
      description: input.description ?? null,
      status: input.status ?? null,
      effective_date: input.effectiveDate ?? null,
      review_date: input.reviewDate ?? null,
      created_by: input.createdBy ?? null,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getFramework(id);
    const result = await this.pool.query(
      `UPDATE compliance_frameworks SET ${assignments.join(", ")}, updated_at = now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<ComplianceFramework>(result.rows[0]);
  }

  async listPolicies(tenantId: string, frameworkId?: string) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_policies
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR framework_id=$2)
       ORDER BY policy_name`,
      [tenantId, frameworkId ?? null],
    );
    return camelRows<CompliancePolicy>(result.rows);
  }

  async getPolicy(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_policies WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<CompliancePolicy>(result.rows[0]);
  }

  async createPolicy(input: CompliancePolicyInput) {
    const result = await this.pool.query(
      `INSERT INTO compliance_policies (
         id, framework_id, tenant_id, policy_name, policy_basis,
         entity_type, location_type, camera_type, normal_retention_days,
         hot_storage_days, warm_storage_days, cold_storage_days,
         backup_required, legal_hold_override, incident_retention_days,
         automatic_deletion_eligibility, approval_authority,
         effective_date, review_date, notes, created_by,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.frameworkId,
        input.tenantId,
        input.policyName,
        input.policyBasis ?? null,
        input.entityType ?? null,
        input.locationType ?? null,
        input.cameraType ?? null,
        input.normalRetentionDays ?? null,
        input.hotStorageDays ?? null,
        input.warmStorageDays ?? null,
        input.coldStorageDays ?? null,
        input.backupRequired ?? false,
        input.legalHoldOverride ?? false,
        input.incidentRetentionDays ?? null,
        input.automaticDeletionEligibility ?? true,
        input.approvalAuthority ?? null,
        input.effectiveDate ?? null,
        input.reviewDate ?? null,
        input.notes ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<CompliancePolicy>(result.rows[0]);
  }

  async updatePolicy(id: string, input: Partial<CompliancePolicyInput>) {
    const values: Record<string, unknown> = {
      framework_id: input.frameworkId,
      tenant_id: input.tenantId,
      policy_name: input.policyName,
      policy_basis: input.policyBasis,
      entity_type: input.entityType,
      location_type: input.locationType,
      camera_type: input.cameraType,
      normal_retention_days: input.normalRetentionDays,
      hot_storage_days: input.hotStorageDays,
      warm_storage_days: input.warmStorageDays,
      cold_storage_days: input.coldStorageDays,
      backup_required: input.backupRequired,
      legal_hold_override: input.legalHoldOverride,
      incident_retention_days: input.incidentRetentionDays,
      automatic_deletion_eligibility: input.automaticDeletionEligibility,
      approval_authority: input.approvalAuthority,
      effective_date: input.effectiveDate,
      review_date: input.reviewDate,
      notes: input.notes,
      created_by: input.createdBy,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getPolicy(id);
    const result = await this.pool.query(
      `UPDATE compliance_policies SET ${assignments.join(", ")}, updated_at = now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<CompliancePolicy>(result.rows[0]);
  }

  async listAssessments(tenantId: string, filters?: ComplianceAssessmentFilters) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_assessments
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR framework_id=$2)
         AND ($3::uuid IS NULL OR branch_node_id=$3)
         AND ($4::compliance_assessment_status IS NULL OR status=$4)
       ORDER BY created_at DESC`,
      [tenantId, filters?.frameworkId ?? null, filters?.branchNodeId ?? null, filters?.status ?? null],
    );
    return camelRows<ComplianceAssessment>(result.rows);
  }

  async getAssessment(id: string) {
    const result = await this.pool.query(`SELECT * FROM compliance_assessments WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    return camelRow<ComplianceAssessment>(result.rows[0]);
  }

  async createAssessment(input: ComplianceAssessmentInput) {
    const result = await this.pool.query(
      `INSERT INTO compliance_assessments (
         id, framework_id, tenant_id, branch_node_id,
         assessment_period_start, assessment_period_end, status,
         summary, evidence, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.frameworkId,
        input.tenantId,
        input.branchNodeId ?? null,
        input.assessmentPeriodStart ?? null,
        input.assessmentPeriodEnd ?? null,
        input.status ?? "incomplete",
        input.summary ? JSON.stringify(input.summary) : null,
        input.evidence ? JSON.stringify(input.evidence) : null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<ComplianceAssessment>(result.rows[0]);
  }

  async updateAssessment(id: string, input: ComplianceAssessmentInput) {
    const values: Record<string, unknown> = {
      framework_id: input.frameworkId,
      tenant_id: input.tenantId,
      branch_node_id: input.branchNodeId ?? null,
      assessment_period_start: input.assessmentPeriodStart ?? null,
      assessment_period_end: input.assessmentPeriodEnd ?? null,
      status: input.status ?? null,
      summary: input.summary ? JSON.stringify(input.summary) : null,
      evidence: input.evidence ? JSON.stringify(input.evidence) : null,
      created_by: input.createdBy ?? null,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getAssessment(id);
    const result = await this.pool.query(
      `UPDATE compliance_assessments SET ${assignments.join(", ")}, updated_at = now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<ComplianceAssessment>(result.rows[0]);
  }

  async listCertificates(assessmentId: string) {
    const result = await this.pool.query(
      `SELECT * FROM compliance_certificates WHERE assessment_id=$1 ORDER BY issued_at DESC`,
      [assessmentId],
    );
    return camelRows<ComplianceCertificate>(result.rows);
  }

  async getCertificate(id: string) {
    const result = await this.pool.query(`SELECT * FROM compliance_certificates WHERE id=$1`, [id]);
    if (!result.rows[0]) return undefined;
    return camelRow<ComplianceCertificate>(result.rows[0]);
  }

  async createCertificate(input: ComplianceCertificateInput) {
    const result = await this.pool.query(
      `INSERT INTO compliance_certificates (
         id, assessment_id, tenant_id, certificate_number, title,
         status, issued_by, issued_at, expiry_date,
         document_hash, signature, metadata, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.assessmentId,
        input.tenantId,
        input.certificateNumber,
        input.title,
        input.status,
        input.issuedBy ?? null,
        input.issuedAt ?? new Date().toISOString(),
        input.expiryDate ?? null,
        input.documentHash ?? null,
        input.signature ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
    return camelRow<ComplianceCertificate>(result.rows[0]);
  }
}
