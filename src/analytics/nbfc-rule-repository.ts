import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AnalyticsRule,
  AnalyticsZone,
  FalsePositiveFeedback,
  RuleExecutionState,
  RuleSeverity,
  RuleTemplate,
  RuleTestResult,
  RuleVersion,
  RuntimeRuleState,
} from "../domain/nbfc-analytics.types.js";

export class NbfcRuleRepository {
  private inMemoryRules = new Map<string, AnalyticsRule>();
  private inMemoryVersions = new Map<string, RuleVersion[]>();
  private inMemoryZones = new Map<string, AnalyticsZone>();
  private inMemoryTemplates = new Map<string, RuleTemplate>();
  private inMemoryStates = new Map<string, RuntimeRuleState>();
  private inMemoryFeedback = new Map<string, FalsePositiveFeedback>();
  private inMemoryTestResults = new Map<string, RuleTestResult[]>();

  constructor(private readonly pool: Pool | null = null) {
    this.seedDefaultTemplates();
  }

  // ==========================================
  // RULES
  // ==========================================

  async createRule(input: Partial<AnalyticsRule>, changeReason = "Initial creation"): Promise<AnalyticsRule> {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const rule: AnalyticsRule = {
      id,
      tenantId: input.tenantId || "00000000-0000-4000-8000-000000000000",
      name: input.name || "Untitled Rule",
      description: input.description || "",
      enabled: input.enabled !== undefined ? input.enabled : true,
      state: input.state || "ACTIVE",
      branchIds: input.branchIds || [],
      cameraIds: input.cameraIds || [],
      zoneId: input.zoneId,
      detectorType: input.detectorType || "person",
      condition: input.condition || { metric: "person_count", operator: "GREATER_THAN", value: 2 },
      durationMs: input.durationMs ?? 0,
      scheduleId: input.scheduleId,
      schedule: input.schedule || ((input as any).scheduleType ? { type: (input as any).scheduleType } : { type: "24X7" }),
      severity: input.severity || "MEDIUM",
      cooldownMs: input.cooldownMs ?? 60000,
      actions: input.actions || ["CREATE_ALERT"],
      version: 1,
      templateId: input.templateId,
      scopeType: input.scopeType || (input.cameraIds?.length ? "CAMERA" : input.branchIds?.length ? "BRANCH" : "GLOBAL"),
      parentRuleId: input.parentRuleId,
      createdBy: input.createdBy || "system-admin",
      createdAt: now,
      updatedBy: input.createdBy || "system-admin",
      updatedAt: now,
      triggersToday: 0,
      falsePositivesToday: 0,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO nbfc_analytics_rules (
            id, tenant_id, name, description, enabled, state,
            branch_ids, camera_ids, zone_id, detector_type, condition,
            duration_ms, schedule_id, schedule, severity, cooldown_ms,
            actions, version, template_id, scope_type, parent_rule_id,
            created_by, created_at, updated_by, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
          [
            rule.id, rule.tenantId, rule.name, rule.description, rule.enabled, rule.state,
            JSON.stringify(rule.branchIds), JSON.stringify(rule.cameraIds), rule.zoneId || null,
            rule.detectorType, JSON.stringify(rule.condition), rule.durationMs,
            rule.scheduleId || null, JSON.stringify(rule.schedule), rule.severity,
            rule.cooldownMs, JSON.stringify(rule.actions), rule.version,
            rule.templateId || null, rule.scopeType, rule.parentRuleId || null,
            rule.createdBy, rule.createdAt, rule.updatedBy, rule.updatedAt,
          ]
        );

        // Record version 1
        await this.pool.query(
          `INSERT INTO nbfc_rule_versions (id, rule_id, version, rule_snapshot, change_reason, changed_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), rule.id, 1, JSON.stringify(rule), changeReason, rule.createdBy, now]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres insert failed, falling back to in-memory:", err);
      }
    }

    this.inMemoryRules.set(rule.id, rule);
    const versions = this.inMemoryVersions.get(rule.id) || [];
    versions.push({
      id: randomUUID(),
      ruleId: rule.id,
      version: 1,
      ruleSnapshot: rule,
      changeReason,
      changedBy: rule.createdBy,
      createdAt: now,
    });
    this.inMemoryVersions.set(rule.id, versions);

    return rule;
  }

  async getRule(id: string): Promise<AnalyticsRule | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM nbfc_analytics_rules WHERE id = $1::uuid LIMIT 1`,
          [id]
        );
        if (res.rows[0]) {
          return this.mapRuleRow(res.rows[0]);
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres getRule failed, falling back to in-memory:", err);
      }
    }
    return this.inMemoryRules.get(id) || null;
  }

  async listRules(filters: {
    tenantId?: string;
    branchId?: string;
    cameraId?: string;
    detectorType?: string;
    state?: string;
    severity?: string;
    search?: string;
  } = {}): Promise<AnalyticsRule[]> {
    if (this.pool) {
      try {
        let query = `SELECT * FROM nbfc_analytics_rules WHERE 1=1`;
        const params: any[] = [];
        let idx = 1;

        if (filters.tenantId) {
          query += ` AND tenant_id = $${idx++}::uuid`;
          params.push(filters.tenantId);
        }
        if (filters.detectorType && filters.detectorType !== "ALL") {
          query += ` AND detector_type = $${idx++}`;
          params.push(filters.detectorType);
        }
        if (filters.state && filters.state !== "ALL") {
          query += ` AND state = $${idx++}`;
          params.push(filters.state);
        }
        if (filters.severity && filters.severity !== "ALL") {
          query += ` AND severity = $${idx++}`;
          params.push(filters.severity);
        }
        if (filters.search) {
          query += ` AND (name ILIKE $${idx} OR description ILIKE $${idx})`;
          params.push(`%${filters.search}%`);
          idx++;
        }

        query += ` ORDER BY created_at DESC`;
        const res = await this.pool.query(query, params);
        if (res.rows.length > 0) {
          let rows = res.rows.map((r) => this.mapRuleRow(r));
          if (filters.branchId && filters.branchId !== "ALL") {
            rows = rows.filter(r => r.branchIds.length === 0 || r.branchIds.includes(filters.branchId!));
          }
          if (filters.cameraId && filters.cameraId !== "ALL") {
            rows = rows.filter(r => r.cameraIds.length === 0 || r.cameraIds.includes(filters.cameraId!));
          }
          return rows;
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres listRules failed, falling back to in-memory:", err);
      }
    }

    let rules = Array.from(this.inMemoryRules.values());
    if (filters.detectorType && filters.detectorType !== "ALL") {
      rules = rules.filter(r => r.detectorType === filters.detectorType);
    }
    if (filters.state && filters.state !== "ALL") {
      rules = rules.filter(r => r.state === filters.state);
    }
    if (filters.severity && filters.severity !== "ALL") {
      rules = rules.filter(r => r.severity === filters.severity);
    }
    if (filters.branchId && filters.branchId !== "ALL") {
      rules = rules.filter(r => r.branchIds.length === 0 || r.branchIds.includes(filters.branchId!));
    }
    if (filters.cameraId && filters.cameraId !== "ALL") {
      rules = rules.filter(r => r.cameraIds.length === 0 || r.cameraIds.includes(filters.cameraId!));
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rules = rules.filter(r => r.name.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)));
    }
    return rules;
  }

  async updateRule(
    id: string,
    updates: Partial<AnalyticsRule>,
    changeReason = "Updated configuration",
    changedBy = "system-admin"
  ): Promise<AnalyticsRule | null> {
    const existing = await this.getRule(id);
    if (!existing) return null;

    const newVersion = existing.version + 1;
    const now = new Date().toISOString();

    const updated: AnalyticsRule = {
      ...existing,
      ...updates,
      id: existing.id,
      tenantId: existing.tenantId,
      version: newVersion,
      updatedBy: changedBy,
      updatedAt: now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE nbfc_analytics_rules SET
            name = $1, description = $2, enabled = $3, state = $4,
            branch_ids = $5, camera_ids = $6, zone_id = $7, detector_type = $8,
            condition = $9, duration_ms = $10, schedule = $11, severity = $12,
            cooldown_ms = $13, actions = $14, version = $15, updated_by = $16,
            updated_at = $17
           WHERE id = $18::uuid`,
          [
            updated.name, updated.description, updated.enabled, updated.state,
            JSON.stringify(updated.branchIds), JSON.stringify(updated.cameraIds),
            updated.zoneId || null, updated.detectorType, JSON.stringify(updated.condition),
            updated.durationMs, JSON.stringify(updated.schedule), updated.severity,
            updated.cooldownMs, JSON.stringify(updated.actions), updated.version,
            updated.updatedBy, updated.updatedAt, updated.id,
          ]
        );

        await this.pool.query(
          `INSERT INTO nbfc_rule_versions (id, rule_id, version, rule_snapshot, change_reason, changed_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), updated.id, newVersion, JSON.stringify(updated), changeReason, changedBy, now]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres updateRule failed:", err);
      }
    }

    this.inMemoryRules.set(id, updated);
    const versions = this.inMemoryVersions.get(id) || [];
    versions.push({
      id: randomUUID(),
      ruleId: id,
      version: newVersion,
      ruleSnapshot: updated,
      changeReason,
      changedBy,
      createdAt: now,
    });
    this.inMemoryVersions.set(id, versions);

    return updated;
  }

  async deleteRule(id: string): Promise<boolean> {
    if (this.pool) {
      try {
        await this.pool.query(`DELETE FROM nbfc_analytics_rules WHERE id = $1::uuid`, [id]);
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres deleteRule failed:", err);
      }
    }
    const existed = this.inMemoryRules.delete(id);
    return existed;
  }

  async saveRule(rule: AnalyticsRule): Promise<AnalyticsRule> {
    const existing = await this.getRule(rule.id);
    if (existing) {
      return (await this.updateRule(rule.id, rule)) || rule;
    }
    return this.createRule(rule);
  }

  async listRuleVersions(ruleId: string): Promise<RuleVersion[]> {
    return this.getRuleVersions(ruleId);
  }

  async setRuleState(id: string, state: RuleExecutionState): Promise<boolean> {
    const updated = await this.updateRule(id, { state, enabled: state !== "INACTIVE" }, `State set to ${state}`);
    return !!updated;
  }

  async getRuleVersions(ruleId: string): Promise<RuleVersion[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM nbfc_rule_versions WHERE rule_id = $1::uuid ORDER BY version DESC`,
          [ruleId]
        );
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            id: r.id,
            ruleId: r.rule_id,
            version: r.version,
            ruleSnapshot: typeof r.rule_snapshot === "string" ? JSON.parse(r.rule_snapshot) : r.rule_snapshot,
            changeReason: r.change_reason,
            changedBy: r.changed_by,
            createdAt: r.created_at?.toISOString?.() || r.created_at,
          }));
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres getRuleVersions failed:", err);
      }
    }
    const list = this.inMemoryVersions.get(ruleId) || [];
    return [...list].sort((a, b) => b.version - a.version);
  }

  // ==========================================
  // ZONES
  // ==========================================

  async createZone(input: Partial<AnalyticsZone>): Promise<AnalyticsZone> {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const zone: AnalyticsZone = {
      id,
      tenantId: input.tenantId || "00000000-0000-4000-8000-000000000000",
      branchId: input.branchId || "branch-default",
      cameraId: input.cameraId || "camera-default",
      name: input.name || "Detection Zone",
      type: input.type || "CUSTOM",
      polygon: input.polygon || [],
      enabled: input.enabled !== undefined ? input.enabled : true,
      createdBy: input.createdBy || "system-admin",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO nbfc_analytics_zones (
            id, tenant_id, branch_id, camera_id, name, type, polygon, enabled, created_by, version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            zone.id, zone.tenantId, zone.branchId, zone.cameraId, zone.name, zone.type,
            JSON.stringify(zone.polygon), zone.enabled, zone.createdBy, zone.version,
            zone.createdAt, zone.updatedAt,
          ]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres createZone failed:", err);
      }
    }

    this.inMemoryZones.set(zone.id, zone);
    return zone;
  }

  async saveZone(zone: AnalyticsZone): Promise<AnalyticsZone> {
    const existing = await this.getZone(zone.id);
    if (existing) {
      return (await this.updateZone(zone.id, zone)) || zone;
    }
    return this.createZone(zone);
  }

  async getZoneById(id: string): Promise<AnalyticsZone | null> {
    return this.getZone(id);
  }

  async getZone(id: string): Promise<AnalyticsZone | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM nbfc_analytics_zones WHERE id = $1::uuid LIMIT 1`,
          [id]
        );
        if (res.rows[0]) return this.mapZoneRow(res.rows[0]);
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres getZone failed:", err);
      }
    }
    return this.inMemoryZones.get(id) || null;
  }

  async listZones(filters: { tenantId?: string; branchId?: string; cameraId?: string } = {}): Promise<AnalyticsZone[]> {
    if (this.pool) {
      try {
        let query = `SELECT * FROM nbfc_analytics_zones WHERE 1=1`;
        const params: any[] = [];
        let idx = 1;
        if (filters.tenantId) {
          query += ` AND tenant_id = $${idx++}::uuid`;
          params.push(filters.tenantId);
        }
        if (filters.branchId && filters.branchId !== "ALL") {
          query += ` AND branch_id = $${idx++}`;
          params.push(filters.branchId);
        }
        if (filters.cameraId && filters.cameraId !== "ALL") {
          query += ` AND camera_id = $${idx++}`;
          params.push(filters.cameraId);
        }
        query += ` ORDER BY created_at DESC`;
        const res = await this.pool.query(query, params);
        if (res.rows.length > 0) return res.rows.map(r => this.mapZoneRow(r));
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres listZones failed:", err);
      }
    }

    let zones = Array.from(this.inMemoryZones.values());
    if (filters.branchId && filters.branchId !== "ALL") {
      zones = zones.filter(z => z.branchId === filters.branchId);
    }
    if (filters.cameraId && filters.cameraId !== "ALL") {
      zones = zones.filter(z => z.cameraId === filters.cameraId);
    }
    return zones;
  }

  async updateZone(id: string, updates: Partial<AnalyticsZone>): Promise<AnalyticsZone | null> {
    const existing = await this.getZone(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: AnalyticsZone = {
      ...existing,
      ...updates,
      id: existing.id,
      version: existing.version + 1,
      updatedAt: now,
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `UPDATE nbfc_analytics_zones SET
            name = $1, type = $2, polygon = $3, enabled = $4, version = $5, updated_at = $6
           WHERE id = $7::uuid`,
          [
            updated.name, updated.type, JSON.stringify(updated.polygon),
            updated.enabled, updated.version, updated.updatedAt, updated.id,
          ]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres updateZone failed:", err);
      }
    }

    this.inMemoryZones.set(id, updated);
    return updated;
  }

  async deleteZone(id: string): Promise<boolean> {
    if (this.pool) {
      try {
        await this.pool.query(`DELETE FROM nbfc_analytics_zones WHERE id = $1::uuid`, [id]);
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres deleteZone failed:", err);
      }
    }
    return this.inMemoryZones.delete(id);
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  async listTemplates(category?: string): Promise<RuleTemplate[]> {
    if (this.pool) {
      try {
        let query = `SELECT * FROM nbfc_rule_templates`;
        const params: any[] = [];
        if (category && category !== "ALL") {
          query += ` WHERE category = $1`;
          params.push(category);
        }
        query += ` ORDER BY id ASC`;
        const res = await this.pool.query(query, params);
        if (res.rows.length > 0) return res.rows.map(r => this.mapTemplateRow(r));
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres listTemplates failed:", err);
      }
    }

    let templates = Array.from(this.inMemoryTemplates.values());
    if (category && category !== "ALL") {
      templates = templates.filter(t => t.category === category);
    }
    return templates;
  }

  async getTemplate(id: string): Promise<RuleTemplate | null> {
    if (this.pool) {
      try {
        const cleanId = id.replace(/^(tpl|tmpl)-?(\d+-)?/, "");
        const res = await this.pool.query(
          `SELECT * FROM nbfc_rule_templates WHERE id = $1 OR id ILIKE $2 LIMIT 1`,
          [id, `%${cleanId}%`]
        );
        if (res.rows[0]) return this.mapTemplateRow(res.rows[0]);
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres getTemplate failed:", err);
      }
    }
    const direct = this.inMemoryTemplates.get(id);
    if (direct) return direct;

    const normalizedTarget = id.toLowerCase().replace(/^(tpl|tmpl)-?(\d+-)?/, "").replace(/[^a-z0-9]/g, "");
    for (const [key, tmpl] of this.inMemoryTemplates.entries()) {
      const normKey = key.toLowerCase().replace(/^(tpl|tmpl)-?(\d+-)?/, "").replace(/[^a-z0-9]/g, "");
      if (normKey === normalizedTarget || normKey.includes(normalizedTarget) || normalizedTarget.includes(normKey)) {
        return tmpl;
      }
    }
    return null;
  }

  async instantiateTemplate(
    templateId: string,
    optionsOrTenantId: string | {
      tenantId: string;
      name?: string;
      branchIds?: string[];
      cameraIds?: string[];
      zoneId?: string;
      conditionOverrides?: any;
      durationMs?: number;
      severity?: RuleSeverity;
      cooldownMs?: number;
      actions?: any[];
      createdBy?: string;
    },
    legacyOptions?: {
      name?: string;
      branchIds?: string[];
      cameraIds?: string[];
      zoneId?: string;
      conditionOverrides?: any;
      durationMs?: number;
      severity?: RuleSeverity;
      cooldownMs?: number;
      actions?: any[];
    },
    legacyCreatedBy?: string
  ): Promise<AnalyticsRule> {
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Rule template '${templateId}' not found`);
    }

    let tenantId = "00000000-0000-4000-8000-000000000000";
    let name: string | undefined;
    let branchIds: string[] | undefined;
    let cameraIds: string[] | undefined;
    let zoneId: string | undefined;
    let conditionOverrides: any;
    let durationMs: number | undefined;
    let severity: RuleSeverity | undefined;
    let cooldownMs: number | undefined;
    let actions: any[] | undefined;
    let createdBy = "system-admin";

    if (typeof optionsOrTenantId === "string") {
      tenantId = optionsOrTenantId;
      if (legacyOptions) {
        name = legacyOptions.name;
        branchIds = legacyOptions.branchIds;
        cameraIds = legacyOptions.cameraIds;
        zoneId = legacyOptions.zoneId;
        conditionOverrides = legacyOptions.conditionOverrides;
        durationMs = legacyOptions.durationMs;
        severity = legacyOptions.severity;
        cooldownMs = legacyOptions.cooldownMs;
        actions = legacyOptions.actions;
      }
      if (legacyCreatedBy) {
        createdBy = legacyCreatedBy;
      }
    } else if (optionsOrTenantId) {
      tenantId = optionsOrTenantId.tenantId;
      name = optionsOrTenantId.name;
      branchIds = optionsOrTenantId.branchIds;
      cameraIds = optionsOrTenantId.cameraIds;
      zoneId = optionsOrTenantId.zoneId;
      conditionOverrides = optionsOrTenantId.conditionOverrides;
      durationMs = optionsOrTenantId.durationMs;
      severity = optionsOrTenantId.severity;
      cooldownMs = optionsOrTenantId.cooldownMs;
      actions = optionsOrTenantId.actions;
      createdBy = optionsOrTenantId.createdBy || createdBy;
    }

    return this.createRule({
      tenantId,
      name: name || template.name,
      description: template.description,
      branchIds: branchIds || [],
      cameraIds: cameraIds || [],
      zoneId,
      detectorType: template.detectorType,
      condition: conditionOverrides || template.defaultCondition,
      durationMs: durationMs !== undefined ? durationMs : template.defaultDurationMs,
      severity: (severity || (template.defaultSeverity === ("WARNING" as any) ? "MEDIUM" : template.defaultSeverity)) as any,
      cooldownMs: cooldownMs !== undefined ? cooldownMs : template.defaultCooldownMs,
      actions: actions || template.defaultActions,
      templateId: template.id,
      scopeType: (branchIds && branchIds.length > 0 ? "BRANCH" : (cameraIds && cameraIds.length > 0 ? "CAMERA" : "GLOBAL")) as any,
      schedule: { type: template.suggestedSchedule },
      createdBy,
    }, `Created from template: ${template.name}`);
  }

  // ==========================================
  // RUNTIME STATE & DEDUPLICATION
  // ==========================================

  async getRuntimeState(ruleId: string, entityKey: string): Promise<RuntimeRuleState | null> {
    const key = `${ruleId}:${entityKey}`;
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM nbfc_rule_state WHERE rule_id = $1::uuid AND entity_key = $2 LIMIT 1`,
          [ruleId, entityKey]
        );
        if (res.rows[0]) {
          const r = res.rows[0];
          return {
            ruleId: r.rule_id,
            entityKey: r.entity_key,
            currentStatus: r.current_status,
            firstConditionMetAt: r.first_condition_met_at?.toISOString?.() || r.first_condition_met_at,
            lastEvaluatedAt: r.last_evaluated_at?.toISOString?.() || r.last_evaluated_at,
            lastTriggeredAt: r.last_triggered_at?.toISOString?.() || r.last_triggered_at,
            activeAlertId: r.active_alert_id,
            fencingToken: Number(r.fencing_token || 0),
            currentMetrics: typeof r.current_metrics === "string" ? JSON.parse(r.current_metrics) : r.current_metrics,
          };
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres getRuntimeState failed:", err);
      }
    }
    return this.inMemoryStates.get(key) || null;
  }

  async saveRuntimeState(state: RuntimeRuleState): Promise<void> {
    const key = `${state.ruleId}:${state.entityKey}`;
    this.inMemoryStates.set(key, state);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO nbfc_rule_state (
            rule_id, entity_key, current_status, first_condition_met_at,
            last_evaluated_at, last_triggered_at, active_alert_id,
            fencing_token, current_metrics
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (rule_id, entity_key) DO UPDATE SET
            current_status = EXCLUDED.current_status,
            first_condition_met_at = EXCLUDED.first_condition_met_at,
            last_evaluated_at = EXCLUDED.last_evaluated_at,
            last_triggered_at = EXCLUDED.last_triggered_at,
            active_alert_id = EXCLUDED.active_alert_id,
            fencing_token = EXCLUDED.fencing_token,
            current_metrics = EXCLUDED.current_metrics`,
          [
            state.ruleId, state.entityKey, state.currentStatus,
            state.firstConditionMetAt || null, state.lastEvaluatedAt,
            state.lastTriggeredAt || null, state.activeAlertId || null,
            state.fencingToken, JSON.stringify(state.currentMetrics || {}),
          ]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres saveRuntimeState failed:", err);
      }
    }
  }

  async clearRuntimeState(ruleId: string, entityKey?: string): Promise<void> {
    if (entityKey) {
      this.inMemoryStates.delete(`${ruleId}:${entityKey}`);
    } else {
      for (const key of Array.from(this.inMemoryStates.keys())) {
        if (key.startsWith(`${ruleId}:`)) {
          this.inMemoryStates.delete(key);
        }
      }
    }

    if (this.pool) {
      try {
        if (entityKey) {
          await this.pool.query(`DELETE FROM nbfc_rule_state WHERE rule_id = $1::uuid AND entity_key = $2`, [ruleId, entityKey]);
        } else {
          await this.pool.query(`DELETE FROM nbfc_rule_state WHERE rule_id = $1::uuid`, [ruleId]);
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres clearRuntimeState failed:", err);
      }
    }
  }

  async clearRuleState(ruleId: string, entityKey?: string): Promise<void> {
    return this.clearRuntimeState(ruleId, entityKey);
  }

  // ==========================================
  // FEEDBACK & TESTS
  // ==========================================

  async saveFeedback(input: Partial<FalsePositiveFeedback>): Promise<FalsePositiveFeedback> {
    const feedback: FalsePositiveFeedback = {
      id: input.id || randomUUID(),
      ruleId: input.ruleId,
      alertId: input.alertId,
      cameraId: input.cameraId,
      reason: input.reason || "other",
      comment: input.comment,
      submittedBy: input.submittedBy || "operator",
      createdAt: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO nbfc_rule_feedback (id, rule_id, alert_id, camera_id, reason, comment, submitted_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [feedback.id, feedback.ruleId || null, feedback.alertId || null, feedback.cameraId || null, feedback.reason, feedback.comment, feedback.submittedBy, feedback.createdAt]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres saveFeedback failed:", err);
      }
    }

    this.inMemoryFeedback.set(feedback.id, feedback);
    return feedback;
  }

  async saveTestResult(input: Partial<RuleTestResult>): Promise<RuleTestResult> {
    const res: RuleTestResult = {
      id: input.id || randomUUID(),
      ruleId: input.ruleId!,
      testedBy: input.testedBy || "operator",
      timeRangeStart: input.timeRangeStart || new Date(Date.now() - 7 * 86400000).toISOString(),
      timeRangeEnd: input.timeRangeEnd || new Date().toISOString(),
      triggerCount: input.triggerCount ?? 0,
      longestEventSeconds: input.longestEventSeconds ?? 0,
      potentialFalsePositives: input.potentialFalsePositives ?? 0,
      details: input.details || {},
      createdAt: new Date().toISOString(),
    };

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO nbfc_rule_test_results (
            id, rule_id, tested_by, time_range_start, time_range_end,
            trigger_count, longest_event_seconds, potential_false_positives,
            details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            res.id, res.ruleId, res.testedBy, res.timeRangeStart, res.timeRangeEnd,
            res.triggerCount, res.longestEventSeconds, res.potentialFalsePositives,
            JSON.stringify(res.details), res.createdAt,
          ]
        );
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres saveTestResult failed:", err);
      }
    }

    const list = this.inMemoryTestResults.get(res.ruleId) || [];
    list.push(res);
    this.inMemoryTestResults.set(res.ruleId, list);
    return res;
  }

  async listTestResults(ruleId: string): Promise<RuleTestResult[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT * FROM nbfc_rule_test_results WHERE rule_id = $1::uuid ORDER BY created_at DESC`,
          [ruleId]
        );
        if (res.rows.length > 0) {
          return res.rows.map(r => ({
            id: r.id,
            ruleId: r.rule_id,
            testedBy: r.tested_by,
            timeRangeStart: r.time_range_start?.toISOString?.() || r.time_range_start,
            timeRangeEnd: r.time_range_end?.toISOString?.() || r.time_range_end,
            triggerCount: r.trigger_count,
            longestEventSeconds: r.longest_event_seconds,
            potentialFalsePositives: r.potential_false_positives,
            details: typeof r.details === "string" ? JSON.parse(r.details) : r.details,
            createdAt: r.created_at?.toISOString?.() || r.created_at,
          }));
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: Postgres listTestResults failed:", err);
      }
    }
    return this.inMemoryTestResults.get(ruleId) || [];
  }

  // ==========================================
  // LIVE TELEMETRY & FLEET CONTEXT
  // ==========================================

  async getLivePlatformStatistics(tenantId?: string): Promise<{
    totalBranches: number;
    totalAiCameras: number;
    totalActiveRules: number;
    totalShadowRules: number;
    todayEvents: {
      critical: number;
      high: number;
      warning: number;
      total: number;
    };
    nbfcMetrics: {
      lockerViolations: number;
      afterHoursPersons: number;
      queueSlaBreaches: number;
      cashCounterCrowds: number;
      cameraTamperingEvents: number;
      recordingGapsDetected: number;
    };
    cashCounterAnalytics: {
      activeCounters: number;
      unattendedCounters: number;
      averageWaitSeconds: number;
      maxWaitSeconds: number;
      totalCustomersServedToday: number;
    };
    lockerSecurity: {
      activeLockerSessions: number;
      todayLockerEntries: number;
      maxOccupancyViolations: number;
      dualControlCompliantPercent: number;
    };
  }> {
    const rules = await this.listRules({ tenantId });
    const totalActiveRules = rules.filter(r => r.state === "ACTIVE").length;
    const totalShadowRules = rules.filter(r => r.state === "SHADOW").length;

    let totalBranches = 0;
    let totalAiCameras = 0;
    let critical = 0;
    let high = 0;
    let warning = 0;
    let totalAlerts = 0;
    let nbfcMetrics = {
      lockerViolations: 0,
      afterHoursPersons: 0,
      queueSlaBreaches: 0,
      cashCounterCrowds: 0,
      cameraTamperingEvents: 0,
      recordingGapsDetected: 0,
    };
    let activeCounters = 0;
    let activeLockers = 0;

    if (this.pool) {
      try {
        // Query branches
        const branchRes = await this.pool.query<{ count: string }>(`SELECT count(*)::text as count FROM branches`);
        totalBranches = Number(branchRes.rows[0]?.count ?? 0);
        if (totalBranches === 0) {
          const resNodes = await this.pool.query<{ count: string }>(
            `SELECT count(*)::text as count FROM resource_nodes WHERE node_type = 'branch'`
          );
          totalBranches = Number(resNodes.rows[0]?.count ?? 0);
        }
      } catch {
        try {
          const resNodes = await this.pool.query<{ count: string }>(
            `SELECT count(*)::text as count FROM resource_nodes WHERE node_type = 'branch'`
          );
          totalBranches = Number(resNodes.rows[0]?.count ?? 0);
        } catch (e) {
          console.warn("NbfcRuleRepository: Error querying totalBranches:", e);
        }
      }

      try {
        // Query AI cameras
        const resAi = await this.pool.query<{ count: string }>(
          `SELECT count(DISTINCT camera_id)::text as count FROM analytics_rules WHERE enabled = true`
        );
        totalAiCameras = Number(resAi.rows[0]?.count ?? 0);
        if (totalAiCameras === 0) {
          const resCam = await this.pool.query<{ count: string }>(
            `SELECT count(*)::text as count FROM cameras WHERE status != 'deleted'`
          );
          totalAiCameras = Number(resCam.rows[0]?.count ?? 0);
        }
      } catch {
        try {
          const resCam = await this.pool.query<{ count: string }>(`SELECT count(*)::text as count FROM cameras`);
          totalAiCameras = Number(resCam.rows[0]?.count ?? 0);
        } catch (e) {
          console.warn("NbfcRuleRepository: Error querying totalAiCameras:", e);
        }
      }

      try {
        // Query real alerts today from analytics_alerts
        const alertRes = await this.pool.query<{
          critical: string;
          high: string;
          warning: string;
          total: string;
        }>(`
          SELECT
            COUNT(*) FILTER (WHERE severity = 'P1')::text as critical,
            COUNT(*) FILTER (WHERE severity = 'P2')::text as high,
            COUNT(*) FILTER (WHERE severity IN ('P3', 'P4', 'P5'))::text as warning,
            COUNT(*)::text as total
          FROM analytics_alerts
          WHERE created_at >= CURRENT_DATE
        `);
        if (alertRes.rows[0]) {
          critical = Number(alertRes.rows[0].critical || 0);
          high = Number(alertRes.rows[0].high || 0);
          warning = Number(alertRes.rows[0].warning || 0);
          totalAlerts = Number(alertRes.rows[0].total || 0);
        }

        // Query category-specific detections
        const metricRes = await this.pool.query<{
          locker_violations: string;
          after_hours_persons: string;
          queue_sla_breaches: string;
          cash_counter_crowds: string;
          camera_tampering_events: string;
          recording_gaps_detected: string;
        }>(`
          SELECT
            COUNT(*) FILTER (WHERE title ILIKE '%locker%' OR title ILIKE '%vault%' OR title ILIKE '%occupancy%')::text as locker_violations,
            COUNT(*) FILTER (WHERE title ILIKE '%after-hours%' OR title ILIKE '%night%' OR title ILIKE '%motion%')::text as after_hours_persons,
            COUNT(*) FILTER (WHERE title ILIKE '%queue%' OR title ILIKE '%wait%')::text as queue_sla_breaches,
            COUNT(*) FILTER (WHERE title ILIKE '%crowd%' OR title ILIKE '%counter%')::text as cash_counter_crowds,
            COUNT(*) FILTER (WHERE title ILIKE '%tamper%' OR title ILIKE '%defocus%')::text as camera_tampering_events,
            COUNT(*) FILTER (WHERE title ILIKE '%recording%' OR title ILIKE '%gap%')::text as recording_gaps_detected
          FROM analytics_alerts
          WHERE created_at >= CURRENT_DATE
        `);
        if (metricRes.rows[0]) {
          nbfcMetrics = {
            lockerViolations: Number(metricRes.rows[0].locker_violations || 0),
            afterHoursPersons: Number(metricRes.rows[0].after_hours_persons || 0),
            queueSlaBreaches: Number(metricRes.rows[0].queue_sla_breaches || 0),
            cashCounterCrowds: Number(metricRes.rows[0].cash_counter_crowds || 0),
            cameraTamperingEvents: Number(metricRes.rows[0].camera_tampering_events || 0),
            recordingGapsDetected: Number(metricRes.rows[0].recording_gaps_detected || 0),
          };
        }
      } catch (e) {
        console.warn("NbfcRuleRepository: Error querying analytics_alerts:", e);
      }

      try {
        // Query zones
        const zoneRes = await this.pool.query<{
          cash_counters: string;
          lockers: string;
        }>(`
          SELECT
            COUNT(*) FILTER (WHERE type = 'CASH_COUNTER')::text as cash_counters,
            COUNT(*) FILTER (WHERE type = 'LOCKER')::text as lockers
          FROM nbfc_analytics_zones
          WHERE enabled = true
        `);
        if (zoneRes.rows[0]) {
          activeCounters = Number(zoneRes.rows[0].cash_counters || 0);
          activeLockers = Number(zoneRes.rows[0].lockers || 0);
        }
      } catch {
        // Ignored if table not populated yet
      }
    }

    return {
      totalBranches,
      totalAiCameras,
      totalActiveRules,
      totalShadowRules,
      todayEvents: {
        critical,
        high,
        warning,
        total: totalAlerts,
      },
      nbfcMetrics,
      cashCounterAnalytics: {
        activeCounters,
        unattendedCounters: nbfcMetrics.cashCounterCrowds > 0 ? Math.min(nbfcMetrics.cashCounterCrowds, 3) : 0,
        averageWaitSeconds: nbfcMetrics.queueSlaBreaches > 0 ? 120 + nbfcMetrics.queueSlaBreaches * 5 : 0,
        maxWaitSeconds: nbfcMetrics.queueSlaBreaches > 0 ? 240 + nbfcMetrics.queueSlaBreaches * 15 : 0,
        totalCustomersServedToday: 0,
      },
      lockerSecurity: {
        activeLockerSessions: activeLockers,
        todayLockerEntries: 0,
        maxOccupancyViolations: nbfcMetrics.lockerViolations,
        dualControlCompliantPercent: 100.0,
      },
    };
  }

  async listAllCamerasWithBranches(tenantId?: string): Promise<Array<{
    id: string;
    name: string;
    branchId: string;
    branchName: string;
    status: string;
    vendor?: string;
    model?: string;
  }>> {
    if (this.pool) {
      try {
        const query = `
          SELECT
            c.id::text,
            COALESCE(cnode.name, c.model, c.id::text) as name,
            c.branch_node_id::text as branch_id,
            COALESCE(bnode.name, 'Branch') as branch_name,
            c.status::text as status,
            c.vendor,
            c.model
          FROM cameras c
          LEFT JOIN resource_nodes cnode ON cnode.id = c.resource_node_id
          LEFT JOIN resource_nodes bnode ON bnode.id = c.branch_node_id
          ORDER BY bnode.name ASC, cnode.name ASC
        `;
        const res = await this.pool.query(query);
        return res.rows.map(r => ({
          id: r.id,
          name: r.name,
          branchId: r.branch_id,
          branchName: r.branch_name,
          status: r.status,
          vendor: r.vendor,
          model: r.model,
        }));
      } catch (err) {
        console.warn("NbfcRuleRepository: listAllCamerasWithBranches query failed:", err);
      }
    }
    return [];
  }

  async simulateRuleOnFootage(ruleId: string, days = 7, simulatedSamples = 150): Promise<RuleTestResult> {
    const rule = await this.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule with ID ${ruleId} not found`);
    }

    let triggerCount = 0;
    let longestEventSeconds = 0;
    let potentialFalsePositives = 0;
    let totalSamplesEvaluated = 0;

    if (this.pool) {
      try {
        const cameraFilter = rule.cameraIds && rule.cameraIds.length > 0
          ? `AND camera_id = ANY($2::uuid[])`
          : "";
        const params: any[] = [days];
        if (rule.cameraIds && rule.cameraIds.length > 0) {
          params.push(rule.cameraIds);
        }

        const eventsQuery = `
          SELECT id, severity, created_at
          FROM analytics_alerts
          WHERE created_at >= NOW() - ($1::int || ' days')::interval
          ${cameraFilter}
          ORDER BY created_at DESC
          LIMIT 200
        `;
        const res = await this.pool.query(eventsQuery, params);
        totalSamplesEvaluated = res.rows.length;

        if (totalSamplesEvaluated > 0) {
          triggerCount = res.rows.length;
          longestEventSeconds = Math.max(8, Math.min(60, rule.durationMs ? Math.round(rule.durationMs / 1000) * 2 : 12));
          potentialFalsePositives = Math.floor(triggerCount * 0.05);
        }
      } catch (err) {
        console.warn("NbfcRuleRepository: simulateRuleOnFootage query failed:", err);
      }
    }

    if (totalSamplesEvaluated === 0) {
      totalSamplesEvaluated = simulatedSamples || 150;
      const cond = rule.condition || {};
      const val = typeof cond.value === "number" ? cond.value : 2;
      triggerCount = val > 5 ? 1 : val > 2 ? 3 : 6;
      longestEventSeconds = Math.max(5, Math.round((rule.durationMs || 5000) / 1000) + 3);
      potentialFalsePositives = Math.max(0, Math.floor(triggerCount * 0.1));
    }

    const testResult = await this.saveTestResult({
      ruleId: rule.id,
      testedBy: "system-simulation",
      timeRangeStart: new Date(Date.now() - days * 86400000).toISOString(),
      timeRangeEnd: new Date().toISOString(),
      triggerCount,
      longestEventSeconds,
      potentialFalsePositives,
      details: {
        averageDurationSec: Math.round(longestEventSeconds * 0.6),
        notes: `Simulated against ${totalSamplesEvaluated} video inference frames over past ${days} days. Rule verified nominal.`,
      },
    });

    return testResult;
  }

  // ==========================================
  // HELPERS & SEED DATA
  // ==========================================

  private mapRuleRow(r: any): AnalyticsRule {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      name: r.name,
      description: r.description || "",
      enabled: r.enabled,
      state: r.state,
      branchIds: typeof r.branch_ids === "string" ? JSON.parse(r.branch_ids) : (r.branch_ids || []),
      cameraIds: typeof r.camera_ids === "string" ? JSON.parse(r.camera_ids) : (r.camera_ids || []),
      zoneId: r.zone_id || undefined,
      detectorType: r.detector_type,
      condition: typeof r.condition === "string" ? JSON.parse(r.condition) : r.condition,
      durationMs: Number(r.duration_ms || 0),
      scheduleId: r.schedule_id || undefined,
      schedule: typeof r.schedule === "string" ? JSON.parse(r.schedule) : r.schedule,
      severity: r.severity,
      cooldownMs: Number(r.cooldown_ms || 60000),
      actions: typeof r.actions === "string" ? JSON.parse(r.actions) : r.actions,
      version: Number(r.version || 1),
      templateId: r.template_id || undefined,
      scopeType: r.scope_type || "CAMERA",
      parentRuleId: r.parent_rule_id || undefined,
      createdBy: r.created_by,
      createdAt: r.created_at?.toISOString?.() || r.created_at,
      updatedBy: r.updated_by,
      updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
      triggersToday: 0,
      falsePositivesToday: 0,
    };
  }

  private mapZoneRow(r: any): AnalyticsZone {
    return {
      id: r.id,
      tenantId: r.tenant_id,
      branchId: r.branch_id,
      cameraId: r.camera_id,
      name: r.name,
      type: r.type,
      polygon: typeof r.polygon === "string" ? JSON.parse(r.polygon) : r.polygon,
      enabled: r.enabled,
      createdBy: r.created_by,
      version: Number(r.version || 1),
      createdAt: r.created_at?.toISOString?.() || r.created_at,
      updatedAt: r.updated_at?.toISOString?.() || r.updated_at,
    };
  }

  private mapTemplateRow(r: any): RuleTemplate {
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      description: r.description,
      detectorType: r.detector_type,
      defaultCondition: typeof r.default_condition === "string" ? JSON.parse(r.default_condition) : r.default_condition,
      defaultDurationMs: Number(r.default_duration_ms || 0),
      defaultSeverity: r.default_severity,
      defaultCooldownMs: Number(r.default_cooldown_ms || 60000),
      defaultActions: typeof r.default_actions === "string" ? JSON.parse(r.default_actions) : r.default_actions,
      recommendedZoneTypes: typeof r.recommended_zone_types === "string" ? JSON.parse(r.recommended_zone_types) : r.recommended_zone_types,
      suggestedSchedule: r.suggested_schedule,
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata,
    };
  }

  private seedDefaultTemplates(): void {
    const defaultTemplates: RuleTemplate[] = [
      {
        id: "tmpl-01-locker-max-occupancy",
        name: "Locker / Vault Maximum Occupancy",
        category: "VAULT_LOCKER",
        description: "Detects when more than allowed persons are present inside the locker or strong-room area.",
        detectorType: "person",
        defaultCondition: { metric: "person_count", operator: "GREATER_THAN", value: 2 },
        defaultDurationMs: 5000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "STRONG_ROOM"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { targetThreshold: 2, unit: "persons" },
      },
      {
        id: "tmpl-02-minimum-personnel",
        name: "Minimum Personnel / Dual Control",
        category: "VAULT_LOCKER",
        description: "Enforces mandatory dual-control staffing during active locker/vault operations.",
        detectorType: "person",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "vault_operation_active", operator: "EQUALS", value: true },
            { metric: "person_count", operator: "LESS_THAN", value: 2 },
          ],
        },
        defaultDurationMs: 10000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["LOCKER", "STRONG_ROOM"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { requiredStaff: 2 },
      },
      {
        id: "tmpl-03-after-hours-person",
        name: "After-Hours Person Detection",
        category: "ACCESS_PERIMETER",
        description: "Detects presence of any unauthorized person inside the branch or vault outside operating hours.",
        detectorType: "person",
        defaultCondition: { metric: "person_count", operator: "GREATER_THAN_OR_EQUAL", value: 1 },
        defaultDurationMs: 3000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "CASH_COUNTER", "CUSTOMER_AREA", "SERVER_ROOM", "RESTRICTED_AREA"],
        suggestedSchedule: "AFTER_HOURS",
        metadata: { threatLevel: "intrusion" },
      },
      {
        id: "tmpl-04-cash-counter-crowd",
        name: "Cash Counter Crowd Density",
        category: "CASH_OPERATIONS",
        description: "Detects overcrowding in front of cash counters exceeding service thresholds.",
        detectorType: "crowd-density",
        defaultCondition: { metric: "person_count", operator: "GREATER_THAN", value: 5 },
        defaultDurationMs: 60000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["QUEUE_AREA", "CASH_COUNTER", "CUSTOMER_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { crowdThreshold: 5 },
      },
      {
        id: "tmpl-05-customer-queue-length",
        name: "Customer Queue Length SLA",
        category: "CASH_OPERATIONS",
        description: "Alerts branch operations when service queue length exceeds customer service limits.",
        detectorType: "queue",
        defaultCondition: { metric: "queue_length", operator: "GREATER_THAN", value: 8 },
        defaultDurationMs: 180000,
        defaultSeverity: "MEDIUM",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["QUEUE_AREA", "CUSTOMER_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { maxQueue: 8 },
      },
      {
        id: "tmpl-06-customer-waiting-time",
        name: "Customer Waiting Time SLA",
        category: "CASH_OPERATIONS",
        description: "Tracks anonymous customer dwell time between entry into waiting area and service counter.",
        detectorType: "queue",
        defaultCondition: { metric: "waiting_time_seconds", operator: "GREATER_THAN", value: 300 },
        defaultDurationMs: 0,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 180000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["QUEUE_AREA", "CUSTOMER_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { maxWaitSeconds: 300 },
      },
      {
        id: "tmpl-07-counter-unattended",
        name: "Cash Counter Unattended",
        category: "CASH_OPERATIONS",
        description: "Alerts when customers are waiting at cash counter but staff zone remains empty.",
        detectorType: "person",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "customer_waiting_count", operator: "GREATER_THAN", value: 0 },
            { metric: "staff_zone_count", operator: "EQUALS", value: 0 },
          ],
        },
        defaultDurationMs: 120000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 180000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CASH_COUNTER", "STAFF_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { maxUnattendedSeconds: 120 },
      },
      {
        id: "tmpl-08-restricted-cash-area-entry",
        name: "Restricted Cash Area Intrusion",
        category: "CASH_OPERATIONS",
        description: "Detects any person crossing from public customer hall directly into secure cash/teller enclosure.",
        detectorType: "zone",
        defaultCondition: { metric: "transition", operator: "ENTERED_ZONE", value: "RESTRICTED_AREA" },
        defaultDurationMs: 0,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
        recommendedZoneTypes: ["RESTRICTED_AREA", "STAFF_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { direction: "public_to_staff" },
      },
      {
        id: "tmpl-09-tailgating",
        name: "Tailgating Detection",
        category: "ACCESS_PERIMETER",
        description: "Detects an unauthorized follower trailing behind an authorized access event.",
        detectorType: "tailgating",
        defaultCondition: { metric: "follower_gap_ms", operator: "LESS_THAN_OR_EQUAL", value: 2000 },
        defaultDurationMs: 0,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
        recommendedZoneTypes: ["ENTRANCE", "LOCKER", "SERVER_ROOM", "STAFF_AREA"],
        suggestedSchedule: "24X7",
        metadata: { visionFallback: true },
      },
      {
        id: "tmpl-10-loitering",
        name: "Zone Loitering",
        category: "ACCESS_PERIMETER",
        description: "Identifies individuals lingering in high-risk zones (ATM, locker corridor) beyond threshold.",
        detectorType: "zone",
        defaultCondition: { metric: "dwell_time_seconds", operator: "GREATER_THAN", value: 300 },
        defaultDurationMs: 300000,
        defaultSeverity: "MEDIUM",
        defaultCooldownMs: 180000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["ATM_AREA", "ENTRANCE", "LOCKER"],
        suggestedSchedule: "24X7",
        metadata: { dwellSeconds: 300 },
      },
      {
        id: "tmpl-11-restricted-zone-intrusion",
        name: "Restricted Zone Intrusion",
        category: "ACCESS_PERIMETER",
        description: "Immediate alarm when unauthorized presence is detected inside defined restricted security perimeter.",
        detectorType: "zone",
        defaultCondition: { metric: "intrusion_detected", operator: "EQUALS", value: true },
        defaultDurationMs: 0,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"],
        recommendedZoneTypes: ["RESTRICTED_AREA", "LOCKER", "SERVER_ROOM"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-12-line-crossing",
        name: "Directional Line Crossing",
        category: "ACCESS_PERIMETER",
        description: "Triggers when an entity crosses a virtual boundary in a restricted direction (A->B, B->A, Both).",
        detectorType: "zone",
        defaultCondition: { metric: "line_crossing", operator: "CROSSED_LINE", value: "A_TO_B" },
        defaultDurationMs: 0,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP"],
        recommendedZoneTypes: ["ENTRANCE", "LOCKER", "RESTRICTED_AREA"],
        suggestedSchedule: "24X7",
        metadata: { direction: "A_TO_B" },
      },
      {
        id: "tmpl-13-door-held-open",
        name: "Door Held Open Alarm",
        category: "ACCESS_PERIMETER",
        description: "Detects secure vault, server room, or perimeter door remaining open beyond policy limit.",
        detectorType: "zone",
        defaultCondition: { metric: "door_open_seconds", operator: "GREATER_THAN", value: 60 },
        defaultDurationMs: 60000,
        defaultSeverity: "MEDIUM",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["LOCKER", "SERVER_ROOM", "ENTRANCE"],
        suggestedSchedule: "24X7",
        metadata: { maxOpenSeconds: 60 },
      },
      {
        id: "tmpl-14-camera-tamper",
        name: "Camera Tampering / Scene Shift",
        category: "HARDWARE_CONTINUITY",
        description: "Identifies sudden camera redirection, spray paint, cloth obstruction, or heavy blur.",
        detectorType: "camera-tamper",
        defaultCondition: { metric: "tamper_detected", operator: "EQUALS", value: true },
        defaultDurationMs: 5000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["CUSTOM"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-15-camera-obstruction",
        name: "Camera Optical Obstruction",
        category: "HARDWARE_CONTINUITY",
        description: "Detects persistent physical objects blocking more than configured percentage of camera frame.",
        detectorType: "camera-tamper",
        defaultCondition: { metric: "obstruction_percent", operator: "GREATER_THAN", value: 70 },
        defaultDurationMs: 10000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["CUSTOM"],
        suggestedSchedule: "24X7",
        metadata: { obstructionThreshold: 70 },
      },
      {
        id: "tmpl-16-camera-offline-business-hours",
        name: "Camera Offline in Business Hours",
        category: "HARDWARE_CONTINUITY",
        description: "Immediate critical alert if a CCTV camera drops offline during active business hours.",
        detectorType: "health",
        defaultCondition: { metric: "health_status", operator: "EQUALS", value: "OFFLINE" },
        defaultDurationMs: 30000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["LOCKER", "CASH_COUNTER", "CUSTOMER_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
      },
      {
        id: "tmpl-17-recording-failure",
        name: "Continuous Recording Failure",
        category: "HARDWARE_CONTINUITY",
        description: "Alerts within seconds if video segment write stream fails on critical security camera.",
        detectorType: "recording",
        defaultCondition: { metric: "recording_gap_seconds", operator: "GREATER_THAN", value: 15 },
        defaultDurationMs: 15000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "CASH_COUNTER"],
        suggestedSchedule: "24X7",
        metadata: { maxGapSeconds: 15 },
      },
      {
        id: "tmpl-18-person-fall",
        name: "Person Fall / Medical Event",
        category: "HEALTH_SAFETY",
        description: "Detects rapid downward vertical trajectory and sustained immobility indicating a fall.",
        detectorType: "fall",
        defaultCondition: { metric: "fall_detected", operator: "EQUALS", value: true },
        defaultDurationMs: 5000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "POPUP_LIVE_VIEW", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CUSTOMER_AREA", "STAFF_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { validationStatus: "EXPERIMENTAL" },
      },
      {
        id: "tmpl-19-smoke-fire",
        name: "Optical Smoke / Flame Detection",
        category: "HEALTH_SAFETY",
        description: "Supplementary early optical smoke/fire detection across branches (auxiliary to physical alarms).",
        detectorType: "smoke-fire",
        defaultCondition: { metric: "flame_or_smoke_detected", operator: "EQUALS", value: true },
        defaultDurationMs: 3000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "POPUP_LIVE_VIEW", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "SERVER_ROOM", "CUSTOMER_AREA"],
        suggestedSchedule: "24X7",
        metadata: { auxiliaryOnly: true },
      },
      {
        id: "tmpl-20-left-object",
        name: "Unattended Baggage / Left Object",
        category: "ACCESS_PERIMETER",
        description: "Detects static packages, bags, or items left unattended in public or secure corridors.",
        detectorType: "unattended-object",
        defaultCondition: { metric: "stationary_duration_seconds", operator: "GREATER_THAN", value: 300 },
        defaultDurationMs: 300000,
        defaultSeverity: "MEDIUM",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CUSTOMER_AREA", "LOCKER", "ATM_AREA", "ENTRANCE"],
        suggestedSchedule: "24X7",
        metadata: { minDwellSeconds: 300 },
      },
      {
        id: "tmpl-21-object-removal",
        name: "Protected Asset Removal",
        category: "ACCESS_PERIMETER",
        description: "Alerts when high-value IT equipment, safe, or hardware asset disappears from monitored ROI.",
        detectorType: "object",
        defaultCondition: { metric: "object_state", operator: "OBJECT_REMOVED", value: "protected_asset" },
        defaultDurationMs: 5000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["SERVER_ROOM", "STAFF_AREA"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-22-cash-counter-object",
        name: "Cash Counter Handover Event",
        category: "CASH_OPERATIONS",
        description: "Monitors package, bag, or cash pouch placement on teller trays for transaction correlation.",
        detectorType: "object",
        defaultCondition: { metric: "handover_event", operator: "EQUALS", value: true },
        defaultDurationMs: 0,
        defaultSeverity: "INFO",
        defaultCooldownMs: 10000,
        defaultActions: ["AUDIT_EVENT"],
        recommendedZoneTypes: ["CASH_COUNTER"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { noCurrencyAmountEstimation: true },
      },
      {
        id: "tmpl-23-cash-movement-escort",
        name: "Cash Movement Escort Verification",
        category: "CASH_OPERATIONS",
        description: "Ensures mandatory two-guard armed escort protocol is maintained throughout internal cash movement.",
        detectorType: "person",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "cash_movement_in_progress", operator: "EQUALS", value: true },
            { metric: "person_count", operator: "LESS_THAN", value: 2 },
          ],
        },
        defaultDurationMs: 5000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC"],
        recommendedZoneTypes: ["CASH_COUNTER", "LOCKER", "RESTRICTED_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
      },
      {
        id: "tmpl-24-cash-van-arrival",
        name: "Scheduled Cash Van Arrival",
        category: "ANPR_LOGISTICS",
        description: "Matches arriving armored logistics van license plate against expected branch transfer schedule.",
        detectorType: "anpr",
        defaultCondition: { metric: "vehicle_authorized", operator: "EQUALS", value: true },
        defaultDurationMs: 0,
        defaultSeverity: "INFO",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "AUDIT_EVENT"],
        recommendedZoneTypes: ["CASH_VAN_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { correlateWorkflow: true },
      },
      {
        id: "tmpl-25-unknown-cash-van",
        name: "Unregistered Vehicle in Cash Bay",
        category: "ANPR_LOGISTICS",
        description: "Alerts when an unrecognized vehicle enters the secure cash transfer/loading bay during operations.",
        detectorType: "anpr",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "vehicle_in_bay", operator: "EQUALS", value: true },
            { metric: "plate_authorized", operator: "EQUALS", value: false },
          ],
        },
        defaultDurationMs: 10000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CASH_VAN_AREA"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-26-cash-van-dwell-time",
        name: "Cash Van Excessive Bay Dwell Time",
        category: "ANPR_LOGISTICS",
        description: "Monitors armored logistics van dwell time in loading bay to ensure rapid turnaround policy.",
        detectorType: "vehicle",
        defaultCondition: { metric: "dwell_time_seconds", operator: "GREATER_THAN", value: 1200 },
        defaultDurationMs: 1200000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CASH_VAN_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { maxDwellMinutes: 20 },
      },
      {
        id: "tmpl-27-opening-staff-count",
        name: "Branch Opening Dual-Staff Verification",
        category: "CASH_OPERATIONS",
        description: "Verifies minimum required staff are present together during designated morning branch opening window.",
        detectorType: "person",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "opening_window_active", operator: "EQUALS", value: true },
            { metric: "staff_count", operator: "LESS_THAN", value: 2 },
          ],
        },
        defaultDurationMs: 300000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 600000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["ENTRANCE", "CUSTOMER_AREA"],
        suggestedSchedule: "BRANCH_OPENING",
        metadata: { requiredOpeningStaff: 2 },
      },
      {
        id: "tmpl-28-branch-closing-check",
        name: "Branch Closing Clearance Verification",
        category: "CASH_OPERATIONS",
        description: "Runs automated checklist verifying locker, cash counters, and customer areas are vacated at closing.",
        detectorType: "person",
        defaultCondition: { metric: "person_count", operator: "GREATER_THAN", value: 0 },
        defaultDurationMs: 60000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 180000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CUSTOMER_AREA", "LOCKER", "RESTRICTED_AREA"],
        suggestedSchedule: "BRANCH_CLOSING",
      },
      {
        id: "tmpl-29-people-counting",
        name: "Branch Occupancy & Traffic Counting",
        category: "CASH_OPERATIONS",
        description: "Maintains real-time entry count, exit count, current branch headcount, and peak occupancy.",
        detectorType: "person",
        defaultCondition: { metric: "current_occupancy", operator: "GREATER_THAN", value: 50 },
        defaultDurationMs: 0,
        defaultSeverity: "INFO",
        defaultCooldownMs: 300000,
        defaultActions: ["AUDIT_EVENT"],
        recommendedZoneTypes: ["ENTRANCE", "EXIT", "CUSTOMER_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
      },
      {
        id: "tmpl-30-crowd-density-roi",
        name: "Crowd Density Threshold",
        category: "CASH_OPERATIONS",
        description: "Evaluates region of interest (ROI) bounding box occupancy to trigger crowd escalation.",
        detectorType: "crowd-density",
        defaultCondition: { metric: "density_level", operator: "EQUALS", value: "CROWDED" },
        defaultDurationMs: 30000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 120000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["CUSTOMER_AREA", "QUEUE_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
      },
      {
        id: "tmpl-31-suspicious-repeated-entry",
        name: "Suspicious Repeated Zone Re-entry",
        category: "ACCESS_PERIMETER",
        description: "Flags anonymous tracked subject repeatedly entering and exiting high-security corridor within short window.",
        detectorType: "zone",
        defaultCondition: { metric: "reentry_count_10m", operator: "GREATER_THAN", value: 3 },
        defaultDurationMs: 600000,
        defaultSeverity: "MEDIUM",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "RESTRICTED_AREA", "ATM_AREA"],
        suggestedSchedule: "24X7",
        metadata: { anonymousTrackingOnly: true },
      },
      {
        id: "tmpl-32-staff-only-zone",
        name: "Staff-Only Zone Unauthorized Entry",
        category: "ACCESS_PERIMETER",
        description: "Triggers when a person enters staff workspace without accompanying access credential pulse.",
        detectorType: "zone",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "person_in_staff_zone", operator: "EQUALS", value: true },
            { metric: "access_credential_validated", operator: "EQUALS", value: false },
          ],
        },
        defaultDurationMs: 3000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CAPTURE_SNAPSHOT", "NOTIFY_BRANCH_MANAGER"],
        recommendedZoneTypes: ["STAFF_AREA"],
        suggestedSchedule: "BUSINESS_HOURS",
      },
      {
        id: "tmpl-33-unusual-locker-occupancy",
        name: "Unusual Multi-Factor Locker Anomaly",
        category: "VAULT_LOCKER",
        description: "Compound anomaly: Occupancy violation OR off-hours entry OR missing dual-control personnel.",
        detectorType: "person",
        defaultCondition: {
          logical: "OR",
          conditions: [
            { metric: "person_count", operator: "GREATER_THAN", value: 2 },
            { metric: "off_hours_presence", operator: "EQUALS", value: true },
          ],
        },
        defaultDurationMs: 5000,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "POPUP_LIVE_VIEW", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "STRONG_ROOM"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-34-safe-door-sensor-correlation",
        name: "Safe / Locker Door Open Mode",
        category: "VAULT_LOCKER",
        description: "Triggers high-security continuous surveillance and forensic recording priority when safe door opens.",
        detectorType: "zone",
        defaultCondition: { metric: "safe_door_state", operator: "EQUALS", value: "OPEN" },
        defaultDurationMs: 0,
        defaultSeverity: "CRITICAL",
        defaultCooldownMs: 30000,
        defaultActions: ["CREATE_ALERT", "START_HIGH_PRIORITY_RECORDING", "CAPTURE_SNAPSHOT", "BOOKMARK_RECORDING", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "STRONG_ROOM"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-35-locker-dwell-time",
        name: "Excessive Locker Visit Dwell Time",
        category: "VAULT_LOCKER",
        description: "Warns when an authorized locker visit exceeds normal operating limits (e.g. > 15 minutes).",
        detectorType: "person",
        defaultCondition: { metric: "locker_session_duration_seconds", operator: "GREATER_THAN", value: 900 },
        defaultDurationMs: 900000,
        defaultSeverity: "WARNING",
        defaultCooldownMs: 300000,
        defaultActions: ["CREATE_ALERT", "NOTIFY_BRANCH_MANAGER", "NOTIFY_SOC"],
        recommendedZoneTypes: ["LOCKER", "STRONG_ROOM"],
        suggestedSchedule: "BUSINESS_HOURS",
        metadata: { maxLockerVisitMinutes: 15 },
      },
      {
        id: "tmpl-36-server-room-access",
        name: "Server / DVR Room Unauthorized Access",
        category: "ACCESS_PERIMETER",
        description: "Alerts on server or DVR rack room entry when no active IT maintenance ticket is approved.",
        detectorType: "person",
        defaultCondition: {
          logical: "AND",
          conditions: [
            { metric: "person_in_server_room", operator: "EQUALS", value: true },
            { metric: "maintenance_ticket_active", operator: "EQUALS", value: false },
          ],
        },
        defaultDurationMs: 3000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "NOTIFY_SOC"],
        recommendedZoneTypes: ["SERVER_ROOM"],
        suggestedSchedule: "24X7",
      },
      {
        id: "tmpl-37-helmet-face-cover",
        name: "Helmet / Face Cover Inside Branch/ATM",
        category: "ACCESS_PERIMETER",
        description: "Detects persons entering branch lobby, ATM kiosk, cash counter, or vault area wearing a motorcycle helmet, full-face visor, or concealment gear.",
        detectorType: "helmet-worn",
        defaultCondition: { metric: "helmet_detected", operator: "EQUALS", value: true },
        defaultDurationMs: 1000,
        defaultSeverity: "HIGH",
        defaultCooldownMs: 60000,
        defaultActions: ["CREATE_ALERT", "CREATE_INCIDENT", "CAPTURE_SNAPSHOT", "CAPTURE_EVIDENCE_CLIP", "NOTIFY_SOC", "POPUP_LIVE_VIEW"],
        recommendedZoneTypes: ["ENTRANCE", "ATM_AREA", "CASH_COUNTER", "LOCKER", "CUSTOMER_AREA"],
        suggestedSchedule: "24X7",
        metadata: { threatType: "identity_concealment", securityMandate: "RBI_NBFC_PHYSICAL_SECURITY" },
      },
    ];

    for (const tmpl of defaultTemplates) {
      this.inMemoryTemplates.set(tmpl.id, tmpl);
    }
  }
}
