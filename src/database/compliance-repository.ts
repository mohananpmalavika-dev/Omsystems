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

  // ============================================================================
  // COMPLIANCE ENHANCED METHODS
  // ============================================================================

  // Requirements Methods
  async listComplianceRequirements(
    tenantId: string,
    filters?: { frameworkId?: string; category?: string; status?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        r.*,
        f.name as framework_name,
        f.version as framework_version,
        COUNT(DISTINCT c.id) as control_count,
        COUNT(DISTINCT e.id) as evidence_count,
        COUNT(DISTINCT CASE WHEN c.implementation_status = 'implemented' THEN c.id END) as implemented_controls
      FROM compliance_requirements r
      LEFT JOIN compliance_frameworks f ON f.id = r.framework_id
      LEFT JOIN compliance_controls c ON c.requirement_id = r.id
      LEFT JOIN compliance_evidence e ON e.requirement_id = r.id
      WHERE r.tenant_id = $1
        AND ($2::uuid IS NULL OR r.framework_id = $2)
        AND ($3::text IS NULL OR r.category = $3)
        AND ($4::text IS NULL OR r.status = $4)
      GROUP BY r.id, f.name, f.version
      ORDER BY r.created_at DESC`,
      [tenantId, filters?.frameworkId ?? null, filters?.category ?? null, filters?.status ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceRequirement(id: string) {
    const result = await this.pool.query(
      `SELECT 
        r.*,
        f.name as framework_name,
        f.version as framework_version,
        json_agg(
          DISTINCT jsonb_build_object(
            'id', c.id,
            'controlName', c.control_name,
            'controlType', c.control_type,
            'implementationStatus', c.implementation_status,
            'effectivenessRating', c.effectiveness_rating,
            'automated', c.automated
          )
        ) FILTER (WHERE c.id IS NOT NULL) as controls,
        COUNT(DISTINCT e.id) as evidence_count,
        COUNT(DISTINCT t.id) as test_count
      FROM compliance_requirements r
      LEFT JOIN compliance_frameworks f ON f.id = r.framework_id
      LEFT JOIN compliance_controls c ON c.requirement_id = r.id
      LEFT JOIN compliance_evidence e ON e.requirement_id = r.id
      LEFT JOIN compliance_tests t ON t.control_id = c.id
      WHERE r.id = $1
      GROUP BY r.id, f.name, f.version`,
      [id]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceRequirement(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_requirements (
        id, tenant_id, framework_id, parent_id, requirement_code, title, description,
        category, control_type, is_mandatory, applicable_to, testing_frequency_days,
        evidence_required, owner_role, owner_user_id, status, implementation_guidance,
        reference_links, tags, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.frameworkId,
        input.parentId ?? null,
        input.requirementCode,
        input.title,
        input.description,
        input.category ?? null,
        input.controlType ?? null,
        input.isMandatory ?? true,
        input.applicableTo ? JSON.stringify(input.applicableTo) : null,
        input.testingFrequencyDays ?? null,
        input.evidenceRequired ?? true,
        input.ownerRole ?? null,
        input.ownerUserId ?? null,
        input.status ?? 'active',
        input.implementationGuidance ?? null,
        input.referenceLinks ? JSON.stringify(input.referenceLinks) : null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.createdBy,
      ]
    );

    // Log audit trail
    await this.logComplianceAudit(
      input.tenantId,
      'compliance_requirement',
      result.rows[0].id,
      'create',
      input.createdBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateComplianceRequirement(id: string, input: any) {
    // Get old value for audit
    const oldResult = await this.pool.query('SELECT * FROM compliance_requirements WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return undefined;
    const oldValue = oldResult.rows[0];

    const values: Record<string, unknown> = {
      framework_id: input.frameworkId,
      parent_id: input.parentId,
      requirement_code: input.requirementCode,
      title: input.title,
      description: input.description,
      category: input.category,
      control_type: input.controlType,
      is_mandatory: input.isMandatory,
      applicable_to: input.applicableTo ? JSON.stringify(input.applicableTo) : undefined,
      testing_frequency_days: input.testingFrequencyDays,
      evidence_required: input.evidenceRequired,
      owner_role: input.ownerRole,
      owner_user_id: input.ownerUserId,
      status: input.status,
      implementation_guidance: input.implementationGuidance,
      reference_links: input.referenceLinks ? JSON.stringify(input.referenceLinks) : undefined,
      tags: input.tags ? JSON.stringify(input.tags) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceRequirement(id);

    const result = await this.pool.query(
      `UPDATE compliance_requirements SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );

    // Log audit trail
    await this.logComplianceAudit(
      oldValue.tenant_id,
      'compliance_requirement',
      id,
      'update',
      null,
      oldValue,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async deleteComplianceRequirement(id: string) {
    const oldResult = await this.pool.query('SELECT * FROM compliance_requirements WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return;
    const oldValue = oldResult.rows[0];

    await this.pool.query('DELETE FROM compliance_requirements WHERE id = $1', [id]);

    // Log audit trail
    await this.logComplianceAudit(
      oldValue.tenant_id,
      'compliance_requirement',
      id,
      'delete',
      null,
      oldValue,
      null
    );
  }

  // Controls Methods
  async listComplianceControls(
    tenantId: string,
    filters?: { requirementId?: string; implementationStatus?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        c.*,
        r.requirement_code,
        r.title as requirement_title,
        COUNT(DISTINCT t.id) as test_count,
        COUNT(DISTINCT e.id) as evidence_count,
        MAX(t.test_date) as last_test_date
      FROM compliance_controls c
      LEFT JOIN compliance_requirements r ON r.id = c.requirement_id
      LEFT JOIN compliance_tests t ON t.control_id = c.id
      LEFT JOIN compliance_evidence e ON e.control_id = c.id
      WHERE c.tenant_id = $1
        AND ($2::uuid IS NULL OR c.requirement_id = $2)
        AND ($3::text IS NULL OR c.implementation_status = $3)
      GROUP BY c.id, r.requirement_code, r.title
      ORDER BY c.created_at DESC`,
      [tenantId, filters?.requirementId ?? null, filters?.implementationStatus ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceControl(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_controls WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceControl(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_controls (
        id, tenant_id, requirement_id, control_name, control_description, control_type,
        implementation_status, effectiveness_rating, test_frequency_days,
        technical_implementation, automated, continuous_monitoring, control_owner,
        responsible_team, procedure_document_url, training_required, metadata, created_by,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.requirementId,
        input.controlName,
        input.controlDescription,
        input.controlType,
        input.implementationStatus ?? 'planned',
        input.effectivenessRating ?? null,
        input.testFrequencyDays ?? 90,
        input.technicalImplementation ?? null,
        input.automated ?? false,
        input.continuousMonitoring ?? false,
        input.controlOwner ?? null,
        input.responsibleTeam ?? null,
        input.procedureDocumentUrl ?? null,
        input.trainingRequired ?? false,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdBy,
      ]
    );

    await this.logComplianceAudit(
      input.tenantId,
      'compliance_control',
      result.rows[0].id,
      'create',
      input.createdBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateComplianceControl(id: string, input: any) {
    const values: Record<string, unknown> = {
      requirement_id: input.requirementId,
      control_name: input.controlName,
      control_description: input.controlDescription,
      control_type: input.controlType,
      implementation_status: input.implementationStatus,
      effectiveness_rating: input.effectivenessRating,
      test_frequency_days: input.testFrequencyDays,
      technical_implementation: input.technicalImplementation,
      automated: input.automated,
      continuous_monitoring: input.continuousMonitoring,
      control_owner: input.controlOwner,
      responsible_team: input.responsibleTeam,
      procedure_document_url: input.procedureDocumentUrl,
      training_required: input.trainingRequired,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceControl(id);

    const result = await this.pool.query(
      `UPDATE compliance_controls SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;

    return camelRow(result.rows[0]);
  }

  async deleteComplianceControl(id: string) {
    const oldResult = await this.pool.query('SELECT * FROM compliance_controls WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return;
    const oldValue = oldResult.rows[0];

    await this.pool.query('DELETE FROM compliance_controls WHERE id = $1', [id]);

    await this.logComplianceAudit(
      oldValue.tenant_id,
      'compliance_control',
      id,
      'delete',
      null,
      oldValue,
      null
    );
  }

  async updateControlTestDates(
    id: string,
    input: { lastTestDate: string; nextTestDate: string; effectivenessRating?: number }
  ) {
    const result = await this.pool.query(
      `UPDATE compliance_controls 
      SET 
        last_test_date = $1,
        next_test_date = $2,
        effectiveness_rating = COALESCE($3, effectiveness_rating),
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [input.lastTestDate, input.nextTestDate, input.effectivenessRating ?? null, id]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  // Audit Logging Helper
  async logComplianceAudit(
    tenantId: string,
    entityType: string,
    entityId: string,
    action: string,
    userId: string | null,
    oldValue: any,
    newValue: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    await this.pool.query(
      `INSERT INTO compliance_audit_log (
        id, tenant_id, entity_type, entity_id, action, user_id,
        old_value, new_value, ip_address, user_agent, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        randomUUID(),
        tenantId,
        entityType,
        entityId,
        action,
        userId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress ?? null,
        userAgent ?? null,
      ]
    );
  }

  // Dashboard Methods
  async getComplianceDashboard(tenantId: string, frameworkId?: string) {
    const result = await this.pool.query(
      `SELECT 
        framework_id,
        framework_name,
        total_requirements,
        total_controls,
        controls_implemented,
        controls_verified,
        open_findings,
        critical_findings,
        evidence_collected,
        last_assessment_date
      FROM compliance_dashboard_summary
      WHERE tenant_id = $1
        AND ($2::uuid IS NULL OR framework_id = $2)
      ORDER BY framework_name`,
      [tenantId, frameworkId ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceAuditLog(
    tenantId: string,
    filters?: {
      entityType?: string;
      entityId?: string;
      action?: string;
      from?: string;
      to?: string;
      limit?: number;
    }
  ) {
    const result = await this.pool.query(
      `SELECT 
        cal.*,
        u.name as user_name,
        u.email as user_email
      FROM compliance_audit_log cal
      LEFT JOIN users u ON u.id = cal.user_id
      WHERE cal.tenant_id = $1
        AND ($2::text IS NULL OR cal.entity_type = $2)
        AND ($3::uuid IS NULL OR cal.entity_id = $3)
        AND ($4::text IS NULL OR cal.action = $4)
        AND ($5::timestamptz IS NULL OR cal.created_at >= $5)
        AND ($6::timestamptz IS NULL OR cal.created_at <= $6)
      ORDER BY cal.created_at DESC
      LIMIT $7`,
      [
        tenantId,
        filters?.entityType ?? null,
        filters?.entityId ?? null,
        filters?.action ?? null,
        filters?.from ?? null,
        filters?.to ?? null,
        filters?.limit ?? 100,
      ]
    );
    return camelRows(result.rows);
  }

  // Evidence Methods
  async listComplianceEvidence(
    tenantId: string,
    filters?: { requirementId?: string; controlId?: string; assessmentId?: string; validated?: boolean }
  ) {
    const result = await this.pool.query(
      `SELECT 
        e.*,
        r.requirement_code,
        c.control_name,
        u.name as collected_by_name,
        v.name as validated_by_name
      FROM compliance_evidence e
      LEFT JOIN compliance_requirements r ON r.id = e.requirement_id
      LEFT JOIN compliance_controls c ON c.id = e.control_id
      LEFT JOIN users u ON u.id = e.collected_by
      LEFT JOIN users v ON v.id = e.validated_by
      WHERE e.tenant_id = $1
        AND ($2::uuid IS NULL OR e.requirement_id = $2)
        AND ($3::uuid IS NULL OR e.control_id = $3)
        AND ($4::uuid IS NULL OR e.assessment_id = $4)
        AND ($5::boolean IS NULL OR e.validated = $5)
      ORDER BY e.created_at DESC`,
      [
        tenantId,
        filters?.requirementId ?? null,
        filters?.controlId ?? null,
        filters?.assessmentId ?? null,
        filters?.validated ?? null,
      ]
    );
    return camelRows(result.rows);
  }

  async getComplianceEvidence(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_evidence WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceEvidence(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_evidence (
        id, tenant_id, requirement_id, control_id, assessment_id, evidence_type,
        title, description, file_url, file_hash, file_size_bytes, file_mime_type,
        collection_date, evidence_date, expiry_date, tags, sensitivity, collected_by,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.requirementId ?? null,
        input.controlId ?? null,
        input.assessmentId ?? null,
        input.evidenceType,
        input.title,
        input.description ?? null,
        input.fileUrl ?? null,
        input.fileHash ?? null,
        input.fileSizeBytes ?? null,
        input.fileMimeType ?? null,
        input.collectionDate ?? new Date().toISOString(),
        input.evidenceDate ?? null,
        input.expiryDate ?? null,
        input.tags ? JSON.stringify(input.tags) : null,
        input.sensitivity ?? 'internal',
        input.collectedBy,
      ]
    );

    await this.logComplianceAudit(
      input.tenantId,
      'compliance_evidence',
      result.rows[0].id,
      'create',
      input.collectedBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateComplianceEvidence(id: string, input: any) {
    const values: Record<string, unknown> = {
      requirement_id: input.requirementId,
      control_id: input.controlId,
      assessment_id: input.assessmentId,
      evidence_type: input.evidenceType,
      title: input.title,
      description: input.description,
      file_url: input.fileUrl,
      file_hash: input.fileHash,
      file_size_bytes: input.fileSizeBytes,
      file_mime_type: input.fileMimeType,
      collection_date: input.collectionDate,
      evidence_date: input.evidenceDate,
      expiry_date: input.expiryDate,
      tags: input.tags ? JSON.stringify(input.tags) : undefined,
      sensitivity: input.sensitivity,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceEvidence(id);

    const result = await this.pool.query(
      `UPDATE compliance_evidence SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteComplianceEvidence(id: string) {
    const oldResult = await this.pool.query('SELECT * FROM compliance_evidence WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return;
    const oldValue = oldResult.rows[0];

    await this.pool.query('DELETE FROM compliance_evidence WHERE id = $1', [id]);

    await this.logComplianceAudit(
      oldValue.tenant_id,
      'compliance_evidence',
      id,
      'delete',
      null,
      oldValue,
      null
    );
  }

  async validateComplianceEvidence(id: string, validated: boolean, validatorId: string, notes?: string) {
    const result = await this.pool.query(
      `UPDATE compliance_evidence 
      SET 
        validated = $1,
        validated_by = $2,
        validated_at = now(),
        validation_notes = $3,
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [validated, validatorId, notes ?? null, id]
    );

    if (result.rows[0]) {
      await this.logComplianceAudit(
        result.rows[0].tenant_id,
        'compliance_evidence',
        id,
        validated ? 'validate' : 'invalidate',
        validatorId,
        null,
        result.rows[0]
      );
    }

    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // Tests Methods
  async listComplianceTests(tenantId: string, filters?: { controlId?: string; status?: string }) {
    const result = await this.pool.query(
      `SELECT t.*, c.control_name
      FROM compliance_tests t
      LEFT JOIN compliance_controls c ON c.id = t.control_id
      WHERE t.tenant_id = $1
        AND ($2::uuid IS NULL OR t.control_id = $2)
        AND ($3::text IS NULL OR t.status = $3)
      ORDER BY t.test_date DESC`,
      [tenantId, filters?.controlId ?? null, filters?.status ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceTest(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_tests WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceTest(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_tests (
        id, tenant_id, control_id, test_name, test_type, test_date, tester_name,
        status, test_procedure, test_criteria, sample_size, findings, issues_found,
        risk_rating, pass_fail, score, evidence_collected, recommendations,
        next_test_date, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.controlId,
        input.testName,
        input.testType,
        input.testDate,
        input.testerName ?? null,
        input.status ?? 'not_started',
        input.testProcedure ?? null,
        input.testCriteria ?? null,
        input.sampleSize ?? null,
        input.findings ?? null,
        input.issuesFound ?? 0,
        input.riskRating ?? null,
        input.passFail ?? null,
        input.score ?? null,
        input.evidenceCollected ? JSON.stringify(input.evidenceCollected) : null,
        input.recommendations ?? null,
        input.nextTestDate ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async updateComplianceTest(id: string, input: any) {
    const values: Record<string, unknown> = {
      test_name: input.testName,
      test_type: input.testType,
      test_date: input.testDate,
      tester_name: input.testerName,
      status: input.status,
      test_procedure: input.testProcedure,
      test_criteria: input.testCriteria,
      sample_size: input.sampleSize,
      findings: input.findings,
      issues_found: input.issuesFound,
      risk_rating: input.riskRating,
      pass_fail: input.passFail,
      score: input.score,
      evidence_collected: input.evidenceCollected ? JSON.stringify(input.evidenceCollected) : undefined,
      recommendations: input.recommendations,
      next_test_date: input.nextTestDate,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceTest(id);

    const result = await this.pool.query(
      `UPDATE compliance_tests SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteComplianceTest(id: string) {
    await this.pool.query('DELETE FROM compliance_tests WHERE id = $1', [id]);
  }

  // Findings Methods
  async listComplianceFindings(
    tenantId: string,
    filters?: { assessmentId?: string; severity?: string; status?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        f.*,
        a.assessment_name,
        r.requirement_code,
        COUNT(DISTINCT rp.id) as remediation_plan_count
      FROM compliance_findings f
      LEFT JOIN compliance_assessments a ON a.id = f.assessment_id
      LEFT JOIN compliance_requirements r ON r.id = f.requirement_id
      LEFT JOIN compliance_remediation_plans rp ON rp.finding_id = f.id
      WHERE f.tenant_id = $1
        AND ($2::uuid IS NULL OR f.assessment_id = $2)
        AND ($3::text IS NULL OR f.severity = $3)
        AND ($4::text IS NULL OR f.status = $4)
      GROUP BY f.id, a.assessment_name, r.requirement_code
      ORDER BY f.risk_score DESC, f.created_at DESC`,
      [tenantId, filters?.assessmentId ?? null, filters?.severity ?? null, filters?.status ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceFinding(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_findings WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceFinding(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_findings (
        id, tenant_id, assessment_id, test_id, requirement_id, control_id,
        finding_number, title, description, finding_type, severity, likelihood,
        impact_description, root_cause, affected_systems, affected_locations,
        discovered_date, status, assigned_to, due_date, recommendations, discovered_by,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assessmentId ?? null,
        input.testId ?? null,
        input.requirementId ?? null,
        input.controlId ?? null,
        input.findingNumber,
        input.title,
        input.description,
        input.findingType,
        input.severity,
        input.likelihood,
        input.impactDescription ?? null,
        input.rootCause ?? null,
        input.affectedSystems ? JSON.stringify(input.affectedSystems) : null,
        input.affectedLocations ? JSON.stringify(input.affectedLocations) : null,
        input.discoveredDate ?? new Date().toISOString(),
        input.status ?? 'open',
        input.assignedTo ?? null,
        input.dueDate ?? null,
        input.recommendations ?? null,
        input.discoveredBy,
      ]
    );

    await this.logComplianceAudit(
      input.tenantId,
      'compliance_finding',
      result.rows[0].id,
      'create',
      input.discoveredBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateComplianceFinding(id: string, input: any) {
    const values: Record<string, unknown> = {
      assessment_id: input.assessmentId,
      test_id: input.testId,
      requirement_id: input.requirementId,
      control_id: input.controlId,
      finding_number: input.findingNumber,
      title: input.title,
      description: input.description,
      finding_type: input.findingType,
      severity: input.severity,
      likelihood: input.likelihood,
      impact_description: input.impactDescription,
      root_cause: input.rootCause,
      affected_systems: input.affectedSystems ? JSON.stringify(input.affectedSystems) : undefined,
      affected_locations: input.affectedLocations ? JSON.stringify(input.affectedLocations) : undefined,
      discovered_date: input.discoveredDate,
      status: input.status,
      assigned_to: input.assignedTo,
      due_date: input.dueDate,
      recommendations: input.recommendations,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceFinding(id);

    const result = await this.pool.query(
      `UPDATE compliance_findings SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteComplianceFinding(id: string) {
    const oldResult = await this.pool.query('SELECT * FROM compliance_findings WHERE id = $1', [id]);
    if (oldResult.rows.length === 0) return;
    const oldValue = oldResult.rows[0];

    await this.pool.query('DELETE FROM compliance_findings WHERE id = $1', [id]);

    await this.logComplianceAudit(
      oldValue.tenant_id,
      'compliance_finding',
      id,
      'delete',
      null,
      oldValue,
      null
    );
  }

  async closeComplianceFinding(id: string, closedBy: string, notes?: string) {
    const result = await this.pool.query(
      `UPDATE compliance_findings 
      SET 
        status = 'closed',
        closed_by = $1,
        closed_at = now(),
        closure_notes = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [closedBy, notes ?? null, id]
    );

    if (result.rows[0]) {
      await this.logComplianceAudit(
        result.rows[0].tenant_id,
        'compliance_finding',
        id,
        'close',
        closedBy,
        null,
        result.rows[0]
      );
    }

    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // Remediation Plans Methods
  async listRemediationPlans(tenantId: string, filters?: { findingId?: string; status?: string }) {
    const result = await this.pool.query(
      `SELECT 
        rp.*,
        f.finding_number,
        f.title as finding_title,
        COUNT(DISTINCT ra.id) as action_count,
        COUNT(DISTINCT CASE WHEN ra.status = 'completed' THEN ra.id END) as completed_actions
      FROM compliance_remediation_plans rp
      LEFT JOIN compliance_findings f ON f.id = rp.finding_id
      LEFT JOIN compliance_remediation_actions ra ON ra.plan_id = rp.id
      WHERE rp.tenant_id = $1
        AND ($2::uuid IS NULL OR rp.finding_id = $2)
        AND ($3::text IS NULL OR rp.status = $3)
      GROUP BY rp.id, f.finding_number, f.title
      ORDER BY rp.created_at DESC`,
      [tenantId, filters?.findingId ?? null, filters?.status ?? null]
    );
    return camelRows(result.rows);
  }

  async getRemediationPlan(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_remediation_plans WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createRemediationPlan(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_remediation_plans (
        id, tenant_id, finding_id, plan_number, title, description, status,
        proposed_solution, implementation_steps, resource_requirements,
        estimated_cost, planned_start_date, planned_completion_date,
        owner_id, approver_id, progress_percentage, verification_required,
        metadata, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.findingId,
        input.planNumber,
        input.title,
        input.description,
        input.status ?? 'identified',
        input.proposedSolution,
        input.implementationSteps ?? null,
        input.resourceRequirements ?? null,
        input.estimatedCost ?? null,
        input.plannedStartDate ?? null,
        input.plannedCompletionDate ?? null,
        input.ownerId ?? null,
        input.approverId ?? null,
        input.progressPercentage ?? 0,
        input.verificationRequired ?? true,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdBy,
      ]
    );

    await this.logComplianceAudit(
      input.tenantId,
      'remediation_plan',
      result.rows[0].id,
      'create',
      input.createdBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateRemediationPlan(id: string, input: any) {
    const values: Record<string, unknown> = {
      finding_id: input.findingId,
      plan_number: input.planNumber,
      title: input.title,
      description: input.description,
      status: input.status,
      proposed_solution: input.proposedSolution,
      implementation_steps: input.implementationSteps,
      resource_requirements: input.resourceRequirements,
      estimated_cost: input.estimatedCost,
      planned_start_date: input.plannedStartDate,
      planned_completion_date: input.plannedCompletionDate,
      owner_id: input.ownerId,
      approver_id: input.approverId,
      progress_percentage: input.progressPercentage,
      verification_required: input.verificationRequired,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getRemediationPlan(id);

    const result = await this.pool.query(
      `UPDATE compliance_remediation_plans SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteRemediationPlan(id: string) {
    await this.pool.query('DELETE FROM compliance_remediation_plans WHERE id = $1', [id]);
  }

  async approveRemediationPlan(id: string, approverId: string) {
    const result = await this.pool.query(
      `UPDATE compliance_remediation_plans 
      SET 
        approver_id = $1,
        approved_at = now(),
        status = CASE WHEN status = 'identified' THEN 'planned' ELSE status END,
        updated_at = now()
      WHERE id = $2
      RETURNING *`,
      [approverId, id]
    );

    if (result.rows[0]) {
      await this.logComplianceAudit(
        result.rows[0].tenant_id,
        'remediation_plan',
        id,
        'approve',
        approverId,
        null,
        result.rows[0]
      );
    }

    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async verifyRemediationPlan(id: string, verifierId: string, input: { verificationNotes?: string; effectivenessConfirmed: boolean }) {
    const result = await this.pool.query(
      `UPDATE compliance_remediation_plans 
      SET 
        status = 'verified',
        verified_by = $1,
        verified_at = now(),
        verification_notes = $2,
        effectiveness_confirmed = $3,
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [verifierId, input.verificationNotes ?? null, input.effectivenessConfirmed, id]
    );

    if (result.rows[0]) {
      await this.logComplianceAudit(
        result.rows[0].tenant_id,
        'remediation_plan',
        id,
        'verify',
        verifierId,
        null,
        result.rows[0]
      );
    }

    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // Remediation Actions Methods
  async listRemediationActions(planId: string) {
    const result = await this.pool.query(
      `SELECT 
        ra.*,
        u.name as assigned_to_name
      FROM compliance_remediation_actions ra
      LEFT JOIN users u ON u.id = ra.assigned_to
      WHERE ra.plan_id = $1
      ORDER BY ra.action_number, ra.created_at`,
      [planId]
    );
    return camelRows(result.rows);
  }

  async getRemediationAction(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_remediation_actions WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createRemediationAction(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_remediation_actions (
        id, plan_id, action_number, title, description, action_type,
        assigned_to, due_date, status, blocker_description,
        evidence_url, notes, created_by, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.planId,
        input.actionNumber,
        input.title,
        input.description ?? null,
        input.actionType ?? null,
        input.assignedTo ?? null,
        input.dueDate ?? null,
        input.status ?? 'pending',
        input.blockerDescription ?? null,
        input.evidenceUrl ?? null,
        input.notes ?? null,
        input.createdBy,
      ]
    );
    return camelRow(result.rows[0]);
  }

  async updateRemediationAction(id: string, input: any) {
    const values: Record<string, unknown> = {
      action_number: input.actionNumber,
      title: input.title,
      description: input.description,
      action_type: input.actionType,
      assigned_to: input.assignedTo,
      due_date: input.dueDate,
      status: input.status,
      blocker_description: input.blockerDescription,
      evidence_url: input.evidenceUrl,
      notes: input.notes,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getRemediationAction(id);

    const result = await this.pool.query(
      `UPDATE compliance_remediation_actions SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteRemediationAction(id: string) {
    await this.pool.query('DELETE FROM compliance_remediation_actions WHERE id = $1', [id]);
  }

  async completeRemediationAction(id: string, input: { evidenceUrl?: string; notes?: string }) {
    const result = await this.pool.query(
      `UPDATE compliance_remediation_actions 
      SET 
        status = 'completed',
        completed_at = now(),
        evidence_url = COALESCE($1, evidence_url),
        notes = COALESCE($2, notes),
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [input.evidenceUrl ?? null, input.notes ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // Risks Methods
  async listComplianceRisks(
    tenantId: string,
    filters?: { frameworkId?: string; category?: string; status?: string }
  ) {
    const result = await this.pool.query(
      `SELECT 
        cr.*,
        f.name as framework_name,
        r.requirement_code
      FROM compliance_risks cr
      LEFT JOIN compliance_frameworks f ON f.id = cr.framework_id
      LEFT JOIN compliance_requirements r ON r.id = cr.requirement_id
      WHERE cr.tenant_id = $1
        AND ($2::uuid IS NULL OR cr.framework_id = $2)
        AND ($3::text IS NULL OR cr.risk_category = $3)
        AND ($4::text IS NULL OR cr.status = $4)
      ORDER BY cr.inherent_risk_score DESC, cr.created_at DESC`,
      [tenantId, filters?.frameworkId ?? null, filters?.category ?? null, filters?.status ?? null]
    );
    return camelRows(result.rows);
  }

  async getComplianceRisk(id: string) {
    const result = await this.pool.query('SELECT * FROM compliance_risks WHERE id = $1', [id]);
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async createComplianceRisk(input: any) {
    const result = await this.pool.query(
      `INSERT INTO compliance_risks (
        id, tenant_id, framework_id, requirement_id, risk_number, risk_title,
        risk_description, risk_category, inherent_likelihood, inherent_impact,
        residual_likelihood, residual_impact, risk_treatment, treatment_plan,
        risk_owner, status, review_frequency_days, metadata, created_by,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now()
      ) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.frameworkId ?? null,
        input.requirementId ?? null,
        input.riskNumber,
        input.riskTitle,
        input.riskDescription,
        input.riskCategory ?? null,
        input.inherentLikelihood,
        input.inherentImpact,
        input.residualLikelihood ?? null,
        input.residualImpact ?? null,
        input.riskTreatment,
        input.treatmentPlan ?? null,
        input.riskOwner ?? null,
        input.status ?? 'identified',
        input.reviewFrequencyDays ?? 90,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.createdBy,
      ]
    );

    await this.logComplianceAudit(
      input.tenantId,
      'compliance_risk',
      result.rows[0].id,
      'create',
      input.createdBy,
      null,
      result.rows[0]
    );

    return camelRow(result.rows[0]);
  }

  async updateComplianceRisk(id: string, input: any) {
    const values: Record<string, unknown> = {
      framework_id: input.frameworkId,
      requirement_id: input.requirementId,
      risk_number: input.riskNumber,
      risk_title: input.riskTitle,
      risk_description: input.riskDescription,
      risk_category: input.riskCategory,
      inherent_likelihood: input.inherentLikelihood,
      inherent_impact: input.inherentImpact,
      residual_likelihood: input.residualLikelihood,
      residual_impact: input.residualImpact,
      risk_treatment: input.riskTreatment,
      treatment_plan: input.treatmentPlan,
      risk_owner: input.riskOwner,
      status: input.status,
      review_frequency_days: input.reviewFrequencyDays,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    };

    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getComplianceRisk(id);

    const result = await this.pool.query(
      `UPDATE compliance_risks SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...params]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async deleteComplianceRisk(id: string) {
    await this.pool.query('DELETE FROM compliance_risks WHERE id = $1', [id]);
  }

  async assessComplianceRisk(id: string, input: { residualLikelihood: string; residualImpact: string; treatmentPlan?: string }) {
    const result = await this.pool.query(
      `UPDATE compliance_risks 
      SET 
        residual_likelihood = $1,
        residual_impact = $2,
        treatment_plan = COALESCE($3, treatment_plan),
        status = CASE WHEN status = 'identified' THEN 'assessed' ELSE status END,
        updated_at = now()
      WHERE id = $4
      RETURNING *`,
      [input.residualLikelihood, input.residualImpact, input.treatmentPlan ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  async reviewComplianceRisk(id: string, input: { reviewNotes?: string; nextReviewDate: string }) {
    const result = await this.pool.query(
      `UPDATE compliance_risks 
      SET 
        last_review_date = now(),
        next_review_date = $1,
        review_notes = $2,
        updated_at = now()
      WHERE id = $3
      RETURNING *`,
      [input.nextReviewDate, input.reviewNotes ?? null, id]
    );
    return result.rows[0] ? camelRow(result.rows[0]) : undefined;
  }

  // Additional Dashboard Methods
  async getRequirementStatus(id: string) {
    const result = await this.pool.query(
      `SELECT 
        r.*,
        COUNT(DISTINCT c.id) as total_controls,
        COUNT(DISTINCT CASE WHEN c.implementation_status = 'implemented' THEN c.id END) as implemented_controls,
        COUNT(DISTINCT CASE WHEN c.implementation_status = 'verified' THEN c.id END) as verified_controls,
        COUNT(DISTINCT e.id) as evidence_count,
        COUNT(DISTINCT CASE WHEN e.validated = true THEN e.id END) as validated_evidence_count,
        COUNT(DISTINCT t.id) as test_count,
        COUNT(DISTINCT CASE WHEN t.status = 'passed' THEN t.id END) as passed_tests,
        COUNT(DISTINCT f.id) as finding_count,
        COUNT(DISTINCT CASE WHEN f.status = 'open' THEN f.id END) as open_findings,
        CASE 
          WHEN COUNT(DISTINCT c.id) = 0 THEN 0
          ELSE ROUND(
            (COUNT(DISTINCT CASE WHEN c.implementation_status IN ('implemented', 'verified') THEN c.id END)::numeric / 
             COUNT(DISTINCT c.id)::numeric) * 100, 2
          )
        END as compliance_percentage
      FROM compliance_requirements r
      LEFT JOIN compliance_controls c ON c.requirement_id = r.id
      LEFT JOIN compliance_evidence e ON e.requirement_id = r.id
      LEFT JOIN compliance_tests t ON t.control_id = c.id
      LEFT JOIN compliance_findings f ON f.requirement_id = r.id
      WHERE r.id = $1
      GROUP BY r.id`,
      [id]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }

  async getFrameworkCoverage(frameworkId: string) {
    const result = await this.pool.query(
      `SELECT 
        f.id as framework_id,
        f.name as framework_name,
        f.version as framework_version,
        COUNT(DISTINCT r.id) as total_requirements,
        COUNT(DISTINCT CASE WHEN r.status = 'active' THEN r.id END) as active_requirements,
        COUNT(DISTINCT c.id) as total_controls,
        COUNT(DISTINCT CASE WHEN c.implementation_status = 'implemented' THEN c.id END) as implemented_controls,
        COUNT(DISTINCT CASE WHEN c.implementation_status = 'verified' THEN c.id END) as verified_controls,
        COUNT(DISTINCT e.id) as total_evidence,
        COUNT(DISTINCT CASE WHEN e.validated = true THEN e.id END) as validated_evidence,
        COUNT(DISTINCT t.id) as total_tests,
        COUNT(DISTINCT CASE WHEN t.status = 'passed' THEN t.id END) as passed_tests,
        COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN t.id END) as failed_tests,
        COUNT(DISTINCT fn.id) as total_findings,
        COUNT(DISTINCT CASE WHEN fn.status = 'open' THEN fn.id END) as open_findings,
        COUNT(DISTINCT CASE WHEN fn.severity = 'critical' THEN fn.id END) as critical_findings,
        COUNT(DISTINCT CASE WHEN fn.severity = 'high' THEN fn.id END) as high_findings,
        COUNT(DISTINCT rp.id) as total_remediation_plans,
        COUNT(DISTINCT CASE WHEN rp.status IN ('completed', 'verified') THEN rp.id END) as completed_plans,
        CASE 
          WHEN COUNT(DISTINCT r.id) = 0 THEN 0
          ELSE ROUND(
            (COUNT(DISTINCT CASE WHEN c.implementation_status IN ('implemented', 'verified') THEN c.id END)::numeric / 
             GREATEST(COUNT(DISTINCT r.id), 1)::numeric) * 100, 2
          )
        END as overall_compliance_percentage
      FROM compliance_frameworks f
      LEFT JOIN compliance_requirements r ON r.framework_id = f.id AND r.status = 'active'
      LEFT JOIN compliance_controls c ON c.requirement_id = r.id
      LEFT JOIN compliance_evidence e ON e.requirement_id = r.id
      LEFT JOIN compliance_tests t ON t.control_id = c.id
      LEFT JOIN compliance_findings fn ON fn.requirement_id = r.id
      LEFT JOIN compliance_remediation_plans rp ON rp.finding_id = fn.id
      WHERE f.id = $1
      GROUP BY f.id, f.name, f.version`,
      [frameworkId]
    );
    if (!result.rows[0]) return undefined;
    return camelRow(result.rows[0]);
  }
}
