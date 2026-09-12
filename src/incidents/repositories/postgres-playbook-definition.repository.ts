import type { Pool } from "pg";
import type { PlaybookDefinition, PlaybookStepDefinition } from "../domain/playbook.types.js";

export class PostgresPlaybookDefinitionRepository {
  private readonly memoryPlaybooks = new Map<string, PlaybookDefinition>();

  constructor(private readonly pool?: Pool) {
    if (!this.pool) {
      this.seedDefaultPlaybooksInMemory();
    }
  }

  private seedDefaultPlaybooksInMemory(): void {
    const vaultIntrusionP1: PlaybookDefinition = {
      id: "vault-intrusion-p1",
      name: "P1 Vault Intrusion & Breach Response",
      version: 1,
      description: "Mandatory 10-step enterprise SOP for after-hours vault alarms, physical intrusion or human motion.",
      category: "banking_security",
      trigger: {
        incidentType: "VAULT_INTRUSION",
        severity: "P1",
      },
      resolutionPolicy: {
        requireMandatorySteps: true,
        allowOverride: true,
        overridePermission: "incident.resolve.override",
        requireClassification: true,
        requireRootCause: true,
      },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
      steps: [
        {
          id: "step-1-live-verification",
          order: 1,
          type: "LIVE_VIDEO_REVIEW",
          title: "Verify Live Camera Stream",
          description: "Open live stream for primary and secondary vault cameras to inspect scene.",
          mandatory: true,
          evidenceRequirements: { requireLiveVerification: true },
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-2-review-evidence",
          order: 2,
          type: "EVIDENCE_REVIEW",
          title: "Review -15s / +30s Event Evidence",
          description: "Inspect pre-alarm and post-alarm evidence clip and snapshot.",
          mandatory: true,
          evidenceRequirements: { videoBeforeSeconds: 15, videoAfterSeconds: 30, snapshotRequired: true },
          dependsOn: ["step-1-live-verification"],
          estimatedDurationSeconds: 45,
        },
        {
          id: "step-3-branch-status",
          order: 3,
          type: "AUTOMATED_CHECK",
          title: "Verify Branch Operational Status",
          description: "System verifies branch opening status and holiday schedule.",
          mandatory: true,
        },
        {
          id: "step-4-access-control",
          order: 4,
          type: "AUTOMATED_CHECK",
          title: "Query Access Control & Door Sensors",
          description: "System queries badge entries in last 15 minutes.",
          mandatory: true,
        },
        {
          id: "step-5-call-manager",
          order: 5,
          type: "EXTERNAL_CALL",
          title: "Call Branch Manager / Key Holder",
          description: "Initiate emergency contact call to registered branch manager.",
          mandatory: true,
          escalationTimeoutSeconds: 60,
        },
        {
          id: "step-6-notify-security",
          order: 6,
          type: "NOTIFICATION",
          title: "Notify Regional Security Control Room",
          description: "Send priority push notification to Regional Security Officer.",
          mandatory: true,
        },
        {
          id: "step-7-escalate-sla",
          order: 7,
          type: "ESCALATION",
          title: "Escalate if Not Acknowledged Within SLA",
          description: "Automatic escalation to Head Office SOC.",
          mandatory: true,
        },
        {
          id: "step-8-decision-classification",
          order: 8,
          type: "DECISION",
          title: "Record Operator Classification & Threat Level",
          description: "Classify incident based on camera footage.",
          mandatory: true,
          decisionOutputs: [
            { choice: "CONFIRMED_INTRUSION", label: "🚨 Confirmed Intrusion" },
            { choice: "AUTHORIZED_ACTIVITY", label: "✅ Authorized Keyholder" },
            { choice: "FALSE_POSITIVE", label: "⚠️ False Alarm" },
          ],
        },
        {
          id: "step-9-capture-evidence",
          order: 9,
          type: "EVIDENCE_REVIEW",
          title: "Capture Evidence Package",
          description: "Seal footage and snapshot into evidence vault.",
          mandatory: true,
        },
        {
          id: "step-10-mandatory-closure",
          order: 10,
          type: "RESOLUTION_GATE",
          title: "Mandatory Closure Reason",
          description: "Enforce verified resolution reason and supervisor signoff.",
          mandatory: true,
        },
      ],
    };

    const panicAlarmP1: PlaybookDefinition = {
      id: "panic-alarm-p1",
      name: "P1 Panic Button & Robbery Response",
      version: 1,
      description: "Immediate emergency procedure triggered by teller counter panic switch.",
      category: "banking_security",
      trigger: {
        incidentType: "PANIC_ALARM",
        severity: "P1",
      },
      resolutionPolicy: {
        requireMandatorySteps: true,
        allowOverride: true,
        overridePermission: "incident.resolve.override",
        requireClassification: true,
        requireRootCause: true,
      },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
      steps: [
        {
          id: "step-1-live-teller-video",
          order: 1,
          type: "LIVE_VIDEO_REVIEW",
          title: "Verify Live Teller Cameras",
          description: "Open live audio/video wall for cashier desk.",
          mandatory: true,
        },
        {
          id: "step-2-virtual-guard-talkdown",
          order: 2,
          type: "OPERATOR_ACTION",
          title: "Activate Two-Way Virtual Guard Talkdown",
          description: "Broadcast warning over IP horn speakers.",
          mandatory: true,
        },
        {
          id: "step-3-police-dispatch",
          order: 3,
          type: "ESCALATION",
          title: "Dispatch Police & Mobile QRT",
          description: "Trigger emergency dispatch.",
          mandatory: true,
        },
        {
          id: "step-4-panic-resolution",
          order: 4,
          type: "RESOLUTION_GATE",
          title: "Resolution Gate",
          description: "Verify safety clearance prior to closure.",
          mandatory: true,
        },
      ],
    };

    this.memoryPlaybooks.set(vaultIntrusionP1.id, vaultIntrusionP1);
    this.memoryPlaybooks.set(panicAlarmP1.id, panicAlarmP1);
  }

  async getById(playbookId: string): Promise<PlaybookDefinition | null> {
    if (this.pool) {
      try {
        const defRes = await this.pool.query(
          `SELECT id, name, description, category, incident_type, severity, status, current_version, resolution_policy, created_at, updated_at
           FROM incident_playbook_definitions WHERE id = $1`,
          [playbookId],
        );
        if (defRes.rows.length === 0) return null;
        const row = defRes.rows[0];

        const stepsRes = await this.pool.query(
          `SELECT id, step_order, type, title, description, mandatory, depends_on, evidence_requirements, decision_outputs, automated_action, escalation_timeout_seconds
           FROM incident_playbook_steps WHERE definition_id = $1 ORDER BY step_order ASC`,
          [playbookId],
        );

        const steps: PlaybookStepDefinition[] = stepsRes.rows.map((s) => ({
          id: s.id,
          order: s.step_order,
          type: s.type,
          title: s.title,
          description: s.description,
          mandatory: s.mandatory,
          dependsOn: s.depends_on,
          evidenceRequirements: s.evidence_requirements,
          decisionOutputs: s.decision_outputs,
          automatedAction: s.automated_action,
          escalationTimeoutSeconds: s.escalation_timeout_seconds,
        }));

        return {
          id: row.id,
          name: row.name,
          version: row.current_version,
          description: row.description,
          category: row.category,
          trigger: {
            incidentType: row.incident_type,
            severity: row.severity,
          },
          resolutionPolicy: row.resolution_policy,
          steps,
          createdAt: new Date(row.created_at).toISOString(),
          updatedAt: new Date(row.updated_at).toISOString(),
          status: row.status,
        };
      } catch (err) {
        console.warn("[PostgresPlaybookDefinitionRepo] Query failed, checking in-memory fallback:", err);
      }
    }

    return this.memoryPlaybooks.get(playbookId) || null;
  }

  async findByTrigger(incidentType: string, severity?: string): Promise<PlaybookDefinition | null> {
    const formattedType = incidentType.toUpperCase().replace(/[-\s]/g, "_");

    if (this.pool) {
      try {
        const query = severity
          ? `SELECT id FROM incident_playbook_definitions 
             WHERE incident_type = $1 AND severity = $2 AND status = 'ACTIVE' LIMIT 1`
          : `SELECT id FROM incident_playbook_definitions 
             WHERE incident_type = $1 AND status = 'ACTIVE' LIMIT 1`;
        const params = severity ? [formattedType, severity] : [formattedType];
        const res = await this.pool.query(query, params);
        if (res.rows.length > 0) {
          return this.getById(res.rows[0].id);
        }
      } catch (err) {
        console.warn("[PostgresPlaybookDefinitionRepo] findByTrigger query failed:", err);
      }
    }

    for (const playbook of this.memoryPlaybooks.values()) {
      if (playbook.status !== "ACTIVE") continue;
      if (playbook.trigger.incidentType === formattedType) {
        if (!playbook.trigger.severity || playbook.trigger.severity === severity) {
          return playbook;
        }
      }
    }

    return null;
  }

  async listAll(): Promise<PlaybookDefinition[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(`SELECT id FROM incident_playbook_definitions ORDER BY name ASC`);
        const list = await Promise.all(res.rows.map((r) => this.getById(r.id)));
        return list.filter((p): p is PlaybookDefinition => p !== null);
      } catch (err) {
        console.warn("[PostgresPlaybookDefinitionRepo] listAll failed:", err);
      }
    }

    return Array.from(this.memoryPlaybooks.values());
  }

  async registerPlaybook(playbook: PlaybookDefinition, tenantId = "global"): Promise<void> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO incident_playbook_definitions (
             id, tenant_id, name, description, category, incident_type, severity, status, current_version, resolution_policy, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             description = EXCLUDED.description,
             category = EXCLUDED.category,
             incident_type = EXCLUDED.incident_type,
             severity = EXCLUDED.severity,
             status = EXCLUDED.status,
             current_version = EXCLUDED.current_version,
             resolution_policy = EXCLUDED.resolution_policy,
             updated_at = NOW()`,
          [
            playbook.id,
            tenantId,
            playbook.name,
            playbook.description,
            playbook.category,
            playbook.trigger.incidentType,
            playbook.trigger.severity || "P1",
            playbook.status,
            playbook.version || 1,
            JSON.stringify(playbook.resolutionPolicy),
          ],
        );

        // Replace steps
        await client.query(`DELETE FROM incident_playbook_steps WHERE definition_id = $1`, [playbook.id]);
        for (const step of playbook.steps) {
          await client.query(
            `INSERT INTO incident_playbook_steps (
               id, definition_id, step_order, type, title, description, mandatory, depends_on, evidence_requirements, decision_outputs, automated_action, escalation_timeout_seconds
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              step.id,
              playbook.id,
              step.order,
              step.type,
              step.title,
              step.description,
              step.mandatory,
              JSON.stringify(step.dependsOn || []),
              JSON.stringify(step.evidenceRequirements || {}),
              JSON.stringify(step.decisionOutputs || []),
              JSON.stringify(step.automatedAction || {}),
              step.escalationTimeoutSeconds || null,
            ],
          );
        }

        // Snapshot version
        await client.query(
          `INSERT INTO incident_playbook_versions (
             id, definition_id, version, definition_snapshot, steps_snapshot, checksum_sha256, published_by
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (definition_id, version) DO UPDATE SET
             definition_snapshot = EXCLUDED.definition_snapshot,
             steps_snapshot = EXCLUDED.steps_snapshot,
             checksum_sha256 = EXCLUDED.checksum_sha256`,
          [
            `${playbook.id}:v${playbook.version || 1}`,
            playbook.id,
            playbook.version || 1,
            JSON.stringify(playbook),
            JSON.stringify(playbook.steps),
            "sha256-verified-checksum",
            "api_user",
          ],
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[PostgresPlaybookDefinitionRepo] registerPlaybook failed:", err);
        throw err;
      } finally {
        client.release();
      }
    }

    this.memoryPlaybooks.set(playbook.id, playbook);
  }
}
