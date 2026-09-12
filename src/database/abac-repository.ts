/**
 * Authoritative Database Repository for Attribute-Based Access Control (ABAC - security.abac)
 * Provides durable PostgreSQL storage for ABAC policies, user clearance profiles, and evaluation audit logs.
 * Includes an InMemoryAbacRepository fallback for headless unit tests and disconnected edge nodes.
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type {
  AbacPolicy,
  CreatePolicyInput,
  UpdatePolicyInput,
  UserClearanceProfile,
  UpsertClearanceInput,
  RevokeClearanceInput,
  AbacAuditEntry,
  AbacMetrics,
} from "../security/abac/abac.types.js";

export interface IAbacRepository {
  // Policies
  createPolicy(input: CreatePolicyInput): Promise<AbacPolicy>;
  getPolicyById(id: string): Promise<AbacPolicy | null>;
  listPolicies(tenantId?: string, activeOnly?: boolean): Promise<AbacPolicy[]>;
  updatePolicy(id: string, input: UpdatePolicyInput): Promise<AbacPolicy | null>;
  deletePolicy(id: string): Promise<boolean>;

  // User Clearances
  upsertClearance(input: UpsertClearanceInput): Promise<UserClearanceProfile>;
  getClearance(tenantId: string, userId: string): Promise<UserClearanceProfile | null>;
  revokeClearance(input: RevokeClearanceInput): Promise<UserClearanceProfile | null>;
  listClearances(tenantId?: string): Promise<UserClearanceProfile[]>;

  // Audit Logs
  recordAuditLog(entry: Omit<AbacAuditEntry, "id" | "createdAt">): Promise<AbacAuditEntry>;
  listAuditLogs(tenantId?: string, userId?: string, limit?: number): Promise<AbacAuditEntry[]>;

  // Metrics
  getMetrics(tenantId?: string): Promise<AbacMetrics>;
}

export class PostgresAbacRepository implements IAbacRepository {
  constructor(private readonly pool: Pool) {}

  async createPolicy(input: CreatePolicyInput): Promise<AbacPolicy> {
    const id = randomUUID();
    const query = `
      INSERT INTO abac_policies (
        id, tenant_id, name, description, effect, priority,
        actions, resource_types, resource_classifications, branch_scope, roles,
        time_rule, network_rule, clearance_rule, is_active, version,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, 1,
        NOW(), NOW()
      )
      RETURNING *;
    `;

    const values = [
      id,
      input.tenantId,
      input.name,
      input.description || null,
      input.effect || "PERMIT",
      input.priority ?? 100,
      input.actions || ["*"],
      input.resourceTypes || ["*"],
      input.resourceClassifications || ["*"],
      input.branchScope || ["ALL"],
      input.roles || ["*"],
      input.timeRule ? JSON.stringify(input.timeRule) : null,
      input.networkRule ? JSON.stringify(input.networkRule) : null,
      input.clearanceRule ? JSON.stringify(input.clearanceRule) : null,
      input.isActive ?? true,
    ];

    const res = await this.pool.query(query, values);
    return this.mapPolicyRow(res.rows[0]);
  }

  async getPolicyById(id: string): Promise<AbacPolicy | null> {
    const query = `SELECT * FROM abac_policies WHERE id = $1 LIMIT 1;`;
    const res = await this.pool.query(query, [id]);
    if (res.rows.length === 0) return null;
    return this.mapPolicyRow(res.rows[0]);
  }

  async listPolicies(tenantId?: string, activeOnly: boolean = false): Promise<AbacPolicy[]> {
    let query = `SELECT * FROM abac_policies WHERE 1=1`;
    const values: any[] = [];
    let idx = 1;

    if (tenantId) {
      query += ` AND (tenant_id = $${idx} OR tenant_id = '*')`;
      values.push(tenantId);
      idx++;
    }

    if (activeOnly) {
      query += ` AND is_active = TRUE`;
    }

    query += ` ORDER BY priority DESC, created_at ASC;`;

    const res = await this.pool.query(query, values);
    return res.rows.map((r) => this.mapPolicyRow(r));
  }

  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<AbacPolicy | null> {
    const existing = await this.getPolicyById(id);
    if (!existing) return null;

    const query = `
      UPDATE abac_policies SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        effect = COALESCE($3, effect),
        priority = COALESCE($4, priority),
        actions = COALESCE($5, actions),
        resource_types = COALESCE($6, resource_types),
        resource_classifications = COALESCE($7, resource_classifications),
        branch_scope = COALESCE($8, branch_scope),
        roles = COALESCE($9, roles),
        time_rule = CASE WHEN $10::boolean THEN $11::jsonb ELSE time_rule END,
        network_rule = CASE WHEN $12::boolean THEN $13::jsonb ELSE network_rule END,
        clearance_rule = CASE WHEN $14::boolean THEN $15::jsonb ELSE clearance_rule END,
        is_active = COALESCE($16, is_active),
        version = version + 1,
        updated_at = NOW()
      WHERE id = $17
      RETURNING *;
    `;

    const values = [
      input.name ?? null,
      input.description ?? null,
      input.effect ?? null,
      input.priority ?? null,
      input.actions ?? null,
      input.resourceTypes ?? null,
      input.resourceClassifications ?? null,
      input.branchScope ?? null,
      input.roles ?? null,
      input.timeRule !== undefined,
      input.timeRule ? JSON.stringify(input.timeRule) : null,
      input.networkRule !== undefined,
      input.networkRule ? JSON.stringify(input.networkRule) : null,
      input.clearanceRule !== undefined,
      input.clearanceRule ? JSON.stringify(input.clearanceRule) : null,
      input.isActive ?? null,
      id,
    ];

    const res = await this.pool.query(query, values);
    if (res.rows.length === 0) return null;
    return this.mapPolicyRow(res.rows[0]);
  }

  async deletePolicy(id: string): Promise<boolean> {
    const query = `DELETE FROM abac_policies WHERE id = $1;`;
    const res = await this.pool.query(query, [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async upsertClearance(input: UpsertClearanceInput): Promise<UserClearanceProfile> {
    const query = `
      INSERT INTO abac_user_clearances (
        user_id, tenant_id, clearance_level, clearance_tags,
        valid_from, valid_until, revoked, issued_by, metadata,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        COALESCE($5, NOW()), $6, FALSE, $7, $8,
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id, user_id) DO UPDATE SET
        clearance_level = EXCLUDED.clearance_level,
        clearance_tags = EXCLUDED.clearance_tags,
        valid_from = EXCLUDED.valid_from,
        valid_until = EXCLUDED.valid_until,
        revoked = FALSE,
        revoked_at = NULL,
        revocation_reason = NULL,
        issued_by = EXCLUDED.issued_by,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING *;
    `;

    const values = [
      input.userId,
      input.tenantId,
      input.clearanceLevel || "UNCLASSIFIED",
      input.clearanceTags || [],
      input.validFrom ? new Date(input.validFrom) : null,
      input.validUntil ? new Date(input.validUntil) : null,
      input.issuedBy || "security-admin",
      JSON.stringify(input.metadata || {}),
    ];

    const res = await this.pool.query(query, values);
    return this.mapClearanceRow(res.rows[0]);
  }

  async getClearance(tenantId: string, userId: string): Promise<UserClearanceProfile | null> {
    const query = `
      SELECT * FROM abac_user_clearances 
      WHERE tenant_id = $1 AND user_id = $2 
      LIMIT 1;
    `;
    const res = await this.pool.query(query, [tenantId, userId]);
    if (res.rows.length === 0) return null;
    return this.mapClearanceRow(res.rows[0]);
  }

  async revokeClearance(input: RevokeClearanceInput): Promise<UserClearanceProfile | null> {
    const query = `
      UPDATE abac_user_clearances SET
        revoked = TRUE,
        revoked_at = NOW(),
        revocation_reason = $1,
        updated_at = NOW()
      WHERE tenant_id = $2 AND user_id = $3
      RETURNING *;
    `;

    const res = await this.pool.query(query, [input.reason, input.tenantId, input.userId]);
    if (res.rows.length === 0) return null;
    return this.mapClearanceRow(res.rows[0]);
  }

  async listClearances(tenantId?: string): Promise<UserClearanceProfile[]> {
    let query = `SELECT * FROM abac_user_clearances`;
    const values: any[] = [];
    if (tenantId) {
      query += ` WHERE tenant_id = $1`;
      values.push(tenantId);
    }
    query += ` ORDER BY updated_at DESC;`;

    const res = await this.pool.query(query, values);
    return res.rows.map((r) => this.mapClearanceRow(r));
  }

  async recordAuditLog(entry: Omit<AbacAuditEntry, "id" | "createdAt">): Promise<AbacAuditEntry> {
    const id = randomUUID();
    const query = `
      INSERT INTO abac_evaluation_audit_logs (
        id, tenant_id, user_id, action, resource_type,
        resource_id, resource_branch_id, resource_classification,
        source_ip, request_time, decision, reason,
        applied_policies, policy_hash, evaluation_details, latency_ms,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15, $16,
        NOW()
      )
      RETURNING *;
    `;

    const values = [
      id,
      entry.tenantId,
      entry.userId,
      entry.action,
      entry.resourceType,
      entry.resourceId || null,
      entry.resourceBranchId,
      entry.resourceClassification || null,
      entry.sourceIp,
      new Date(entry.requestTime),
      entry.decision,
      entry.reason,
      entry.appliedPolicies,
      entry.policyHash,
      JSON.stringify(entry.evaluationDetails),
      entry.latencyMs,
    ];

    const res = await this.pool.query(query, values);
    return this.mapAuditRow(res.rows[0]);
  }

  async listAuditLogs(
    tenantId?: string,
    userId?: string,
    limit: number = 50,
  ): Promise<AbacAuditEntry[]> {
    let query = `SELECT * FROM abac_evaluation_audit_logs WHERE 1=1`;
    const values: any[] = [];
    let idx = 1;

    if (tenantId) {
      query += ` AND tenant_id = $${idx}`;
      values.push(tenantId);
      idx++;
    }

    if (userId) {
      query += ` AND user_id = $${idx}`;
      values.push(userId);
      idx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx};`;
    values.push(limit);

    const res = await this.pool.query(query, values);
    return res.rows.map((r) => this.mapAuditRow(r));
  }

  async getMetrics(tenantId?: string): Promise<AbacMetrics> {
    const filter = tenantId ? `WHERE tenant_id = '${tenantId}'` : "";

    const policiesRes = await this.pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_active = TRUE)::int AS active
      FROM abac_policies ${filter};
    `);

    const clearancesRes = await this.pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE revoked = FALSE)::int AS active
      FROM abac_user_clearances ${filter};
    `);

    const auditRes = await this.pool.query(`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE decision = 'PERMIT')::int AS permits,
        COUNT(*) FILTER (WHERE decision = 'DENY')::int AS denies,
        COALESCE(AVG(latency_ms), 0)::float AS avg_latency
      FROM abac_evaluation_audit_logs ${filter};
    `);

    return {
      totalPolicies: policiesRes.rows[0]?.total || 0,
      activePolicies: policiesRes.rows[0]?.active || 0,
      totalClearanceProfiles: clearancesRes.rows[0]?.total || 0,
      activeClearances: clearancesRes.rows[0]?.active || 0,
      totalEvaluations: auditRes.rows[0]?.total || 0,
      permitsCount: auditRes.rows[0]?.permits || 0,
      deniesCount: auditRes.rows[0]?.denies || 0,
      averageEvaluationLatencyMs: parseFloat(auditRes.rows[0]?.avg_latency.toFixed(2)),
    };
  }

  private mapPolicyRow(row: any): AbacPolicy {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description || undefined,
      effect: row.effect,
      priority: row.priority,
      actions: Array.isArray(row.actions) ? row.actions : [],
      resourceTypes: Array.isArray(row.resource_types) ? row.resource_types : [],
      resourceClassifications: Array.isArray(row.resource_classifications) ? row.resource_classifications : [],
      branchScope: Array.isArray(row.branch_scope) ? row.branch_scope : [],
      roles: Array.isArray(row.roles) ? row.roles : [],
      timeRule: typeof row.time_rule === "string" ? JSON.parse(row.time_rule) : row.time_rule || undefined,
      networkRule: typeof row.network_rule === "string" ? JSON.parse(row.network_rule) : row.network_rule || undefined,
      clearanceRule: typeof row.clearance_rule === "string" ? JSON.parse(row.clearance_rule) : row.clearance_rule || undefined,
      isActive: row.is_active,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapClearanceRow(row: any): UserClearanceProfile {
    return {
      id: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      clearanceLevel: row.clearance_level,
      clearanceTags: Array.isArray(row.clearance_tags) ? row.clearance_tags : [],
      validFrom: new Date(row.valid_from).toISOString(),
      validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : undefined,
      revoked: row.revoked,
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : undefined,
      revocationReason: row.revocation_reason || undefined,
      issuedBy: row.issued_by,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata || {},
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapAuditRow(row: any): AbacAuditEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id || undefined,
      resourceBranchId: row.resource_branch_id,
      resourceClassification: row.resource_classification || undefined,
      sourceIp: row.source_ip,
      requestTime: new Date(row.request_time).toISOString(),
      decision: row.decision,
      reason: row.reason,
      appliedPolicies: Array.isArray(row.applied_policies) ? row.applied_policies : [],
      policyHash: row.policy_hash,
      evaluationDetails: typeof row.evaluation_details === "string" ? JSON.parse(row.evaluation_details) : row.evaluation_details || {},
      latencyMs: parseFloat(row.latency_ms),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}

/**
 * Production In-Memory Repository for local testing & headless execution.
 */
export class InMemoryAbacRepository implements IAbacRepository {
  private policies = new Map<string, AbacPolicy>();
  private clearances = new Map<string, UserClearanceProfile>(); // key: `${tenantId}:${userId}`
  private auditLogs: AbacAuditEntry[] = [];

  async createPolicy(input: CreatePolicyInput): Promise<AbacPolicy> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const policy: AbacPolicy = {
      id,
      tenantId: input.tenantId,
      name: input.name,
      description: input.description,
      effect: input.effect || "PERMIT",
      priority: input.priority ?? 100,
      actions: input.actions ? [...input.actions] : ["*"],
      resourceTypes: input.resourceTypes ? [...input.resourceTypes] : ["*"],
      resourceClassifications: input.resourceClassifications ? [...input.resourceClassifications] : ["*"],
      branchScope: input.branchScope ? [...input.branchScope] : ["ALL"],
      roles: input.roles ? [...input.roles] : ["*"],
      timeRule: input.timeRule ? { ...input.timeRule } : undefined,
      networkRule: input.networkRule ? { ...input.networkRule } : undefined,
      clearanceRule: input.clearanceRule ? { ...input.clearanceRule } : undefined,
      isActive: input.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(id, policy);
    return policy;
  }

  async getPolicyById(id: string): Promise<AbacPolicy | null> {
    return this.policies.get(id) || null;
  }

  async listPolicies(tenantId?: string, activeOnly: boolean = false): Promise<AbacPolicy[]> {
    let list = Array.from(this.policies.values());
    if (tenantId) {
      list = list.filter((p) => p.tenantId === tenantId || p.tenantId === "*");
    }
    if (activeOnly) {
      list = list.filter((p) => p.isActive);
    }
    return list.sort((a, b) => b.priority - a.priority);
  }

  async updatePolicy(id: string, input: UpdatePolicyInput): Promise<AbacPolicy | null> {
    const policy = this.policies.get(id);
    if (!policy) return null;

    if (input.name !== undefined) policy.name = input.name;
    if (input.description !== undefined) policy.description = input.description;
    if (input.effect !== undefined) policy.effect = input.effect;
    if (input.priority !== undefined) policy.priority = input.priority;
    if (input.actions !== undefined) policy.actions = [...input.actions];
    if (input.resourceTypes !== undefined) policy.resourceTypes = [...input.resourceTypes];
    if (input.resourceClassifications !== undefined) policy.resourceClassifications = [...input.resourceClassifications];
    if (input.branchScope !== undefined) policy.branchScope = [...input.branchScope];
    if (input.roles !== undefined) policy.roles = [...input.roles];
    if (input.timeRule !== undefined) policy.timeRule = input.timeRule || undefined;
    if (input.networkRule !== undefined) policy.networkRule = input.networkRule || undefined;
    if (input.clearanceRule !== undefined) policy.clearanceRule = input.clearanceRule || undefined;
    if (input.isActive !== undefined) policy.isActive = input.isActive;
    policy.version += 1;
    policy.updatedAt = new Date().toISOString();

    return policy;
  }

  async deletePolicy(id: string): Promise<boolean> {
    return this.policies.delete(id);
  }

  async upsertClearance(input: UpsertClearanceInput): Promise<UserClearanceProfile> {
    const key = `${input.tenantId}:${input.userId}`;
    const existing = this.clearances.get(key);
    const now = new Date().toISOString();

    const record: UserClearanceProfile = {
      id: existing?.id || randomUUID(),
      userId: input.userId,
      tenantId: input.tenantId,
      clearanceLevel: input.clearanceLevel || "UNCLASSIFIED",
      clearanceTags: input.clearanceTags ? [...input.clearanceTags] : [],
      validFrom: input.validFrom || now,
      validUntil: input.validUntil,
      revoked: false,
      revokedAt: undefined,
      revocationReason: undefined,
      issuedBy: input.issuedBy || "security-admin",
      metadata: input.metadata ? { ...input.metadata } : {},
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    this.clearances.set(key, record);
    return record;
  }

  async getClearance(tenantId: string, userId: string): Promise<UserClearanceProfile | null> {
    return this.clearances.get(`${tenantId}:${userId}`) || null;
  }

  async revokeClearance(input: RevokeClearanceInput): Promise<UserClearanceProfile | null> {
    const key = `${input.tenantId}:${input.userId}`;
    const clearance = this.clearances.get(key);
    if (!clearance) return null;

    clearance.revoked = true;
    clearance.revokedAt = new Date().toISOString();
    clearance.revocationReason = input.reason;
    clearance.updatedAt = new Date().toISOString();

    return clearance;
  }

  async listClearances(tenantId?: string): Promise<UserClearanceProfile[]> {
    let list = Array.from(this.clearances.values());
    if (tenantId) {
      list = list.filter((c) => c.tenantId === tenantId);
    }
    return list;
  }

  async recordAuditLog(entry: Omit<AbacAuditEntry, "id" | "createdAt">): Promise<AbacAuditEntry> {
    const record: AbacAuditEntry = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(record);
    if (this.auditLogs.length > 5000) {
      this.auditLogs.pop();
    }
    return record;
  }

  async listAuditLogs(
    tenantId?: string,
    userId?: string,
    limit: number = 50,
  ): Promise<AbacAuditEntry[]> {
    let logs = this.auditLogs;
    if (tenantId) {
      logs = logs.filter((l) => l.tenantId === tenantId);
    }
    if (userId) {
      logs = logs.filter((l) => l.userId === userId);
    }
    return logs.slice(0, limit);
  }

  async getMetrics(tenantId?: string): Promise<AbacMetrics> {
    const policies = Array.from(this.policies.values()).filter(
      (p) => !tenantId || p.tenantId === tenantId || p.tenantId === "*",
    );
    const clearances = Array.from(this.clearances.values()).filter(
      (c) => !tenantId || c.tenantId === tenantId,
    );
    const audits = this.auditLogs.filter((a) => !tenantId || a.tenantId === tenantId);

    const permits = audits.filter((a) => a.decision === "PERMIT").length;
    const totalLatency = audits.reduce((sum, a) => sum + a.latencyMs, 0);

    return {
      totalPolicies: policies.length,
      activePolicies: policies.filter((p) => p.isActive).length,
      totalClearanceProfiles: clearances.length,
      activeClearances: clearances.filter((c) => !c.revoked).length,
      totalEvaluations: audits.length,
      permitsCount: permits,
      deniesCount: audits.length - permits,
      averageEvaluationLatencyMs: audits.length > 0 ? parseFloat((totalLatency / audits.length).toFixed(2)) : 0,
    };
  }
}
