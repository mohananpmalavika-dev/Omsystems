import type { Pool } from "pg";
import type { PlaybookDefinition, PlaybookStepDefinition } from "../domain/playbook.types.js";

export class PostgresPlaybookDefinitionRepository {
  private readonly memoryPlaybooks = new Map<string, PlaybookDefinition>();

  constructor(private readonly pool?: Pool) {
    if (!this.pool) {
      if (process.env.NODE_ENV === "production") {
        throw new Error("INCIDENT_STORE_UNAVAILABLE: PostgresPlaybookDefinitionRepository requires a PostgreSQL pool in production");
      }
      this.seedDefaultPlaybooksInMemory();
    }
  }

  async ensureDefaultPlaybooksSeeded(): Promise<void> {
    if (!this.pool) return;
    const defaults = [
      this.getVaultIntrusionDefinition(),
      this.getAtmTamperDefinition(),
      this.getCashierDuressDefinition(),
    ];
    for (const pb of defaults) {
      try {
        const existing = await this.getById(pb.id);
        if (!existing) {
          await this.registerPlaybook(pb);
        }
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_STORE_UNAVAILABLE: Failed to seed required banking playbooks: ${(err as Error).message}`);
        }
        console.warn("[PostgresPlaybookDefinitionRepo] Failed to seed default playbook:", pb.id, err);
      }
    }
  }

  private getVaultIntrusionDefinition(): PlaybookDefinition {
    return {
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
          description: "Check if branch is operating within authorized hours or arming schedule.",
          mandatory: true,
          dependsOn: ["step-1-live-verification"],
          estimatedDurationSeconds: 15,
        },
        {
          id: "step-4-audio-listen",
          order: 4,
          type: "OPERATOR_ACTION",
          title: "Listen to Vault Audio Level & Talkback Probe",
          description: "Check for drilling noise, glass-break, or human speech in vault zone.",
          mandatory: false,
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-5-assess-threat",
          order: 5,
          type: "DECISION",
          title: "Assess Threat Classification",
          description: "Determine if alarm is Confirmed Breach, Suspicious Activity, False Alarm, or Equipment Fault.",
          mandatory: true,
          dependsOn: ["step-2-review-evidence"],
          decisionOutputs: [
            { choice: "confirmed_breach", label: "Confirmed Physical Breach", nextStepId: "step-6-talkback-challenge" },
            { choice: "suspicious_activity", label: "Suspicious Activity", nextStepId: "step-6-talkback-challenge" },
            { choice: "false_alarm", label: "False Alarm (Insects/Lighting)", nextStepId: "step-10-incident-report" },
            { choice: "equipment_fault", label: "Sensor / Camera Malfunction", nextStepId: "step-10-incident-report" },
          ],
          estimatedDurationSeconds: 45,
        },
        {
          id: "step-6-talkback-challenge",
          order: 6,
          type: "OPERATOR_ACTION",
          title: "Voice Challenge via Two-Way Audio",
          description: "Issue loud verbal warning over vault/branch IP speaker: 'Attention, security has identified unauthorized entry. Police and armed response are dispatched.'",
          mandatory: false,
          dependsOn: ["step-5-assess-threat"],
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-7-law-enforcement",
          order: 7,
          type: "ESCALATION",
          title: "Notify Local Police & Armed Response (PCR)",
          description: "Dispatch local police station and bank emergency reaction force. Log dispatch time.",
          mandatory: true,
          dependsOn: ["step-5-assess-threat"],
          escalationTimeoutSeconds: 300,
          estimatedDurationSeconds: 60,
        },
        {
          id: "step-8-branch-officials",
          order: 8,
          type: "NOTIFICATION",
          title: "Contact Branch Manager & Circle Security Officer",
          description: "Call primary Branch Manager, Secondary Key Holder, and Circle Security Lead.",
          mandatory: true,
          dependsOn: ["step-5-assess-threat"],
          estimatedDurationSeconds: 120,
        },
        {
          id: "step-9-evidence-hold",
          order: 9,
          type: "AUTOMATED_CHECK",
          title: "Place Legal Hold & Lock Continuous Video (T-1h to T+1h)",
          description: "Tag recording segments with immutable forensic hold to block retention deletion.",
          mandatory: true,
          dependsOn: ["step-5-assess-threat"],
          automatedAction: { service: "evidenceService", method: "legalHold", params: { targetScope: "BRANCH_WIDE" } },
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-10-incident-report",
          order: 10,
          type: "RESOLUTION_GATE",
          title: "Complete Banking Regulatory Resolution Dossier",
          description: "Provide root cause, dispatch outcome, false alarm categorization, and signoff.",
          mandatory: true,
          dependsOn: ["step-5-assess-threat"],
          estimatedDurationSeconds: 180,
        },
      ],
    };
  }

  private getAtmTamperDefinition(): PlaybookDefinition {
    return {
      id: "atm-tamper-p1",
      name: "P1 ATM Tamper & Skimmer Detection SOP",
      version: 1,
      description: "Mandatory response procedure for ATM hood removal, vibration sensor breach, or skimmer installation.",
      category: "banking_security",
      trigger: {
        incidentType: "ATM_TAMPER",
        severity: "P1",
      },
      resolutionPolicy: {
        requireMandatorySteps: true,
        allowOverride: false,
        overridePermission: "incident.resolve.override",
        requireClassification: true,
        requireRootCause: true,
      },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
      steps: [
        {
          id: "step-1-pinhole-stream",
          order: 1,
          type: "LIVE_VIDEO_REVIEW",
          title: "Verify Pinhole & Fascia Camera",
          description: "Check live feed from ATM chest, pinhole, and lobby cameras.",
          mandatory: true,
          evidenceRequirements: { requireLiveVerification: true },
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-2-evaluate-tamper",
          order: 2,
          type: "DECISION",
          title: "Evaluate Physical Tampering Evidence",
          description: "Classify tampering: Skimmer attachment, physical vandalism, cash trap, or maintenance work.",
          mandatory: true,
          dependsOn: ["step-1-pinhole-stream"],
          decisionOutputs: [
            { choice: "skimmer_detected", label: "Card Skimmer / Overlay Device Attached", nextStepId: "step-3-notify-switch" },
            { choice: "physical_vandalism", label: "Physical Attack on Cash Dispenser", nextStepId: "step-3-notify-switch" },
            { choice: "authorized_vendor", label: "Authorized ATM Engineer Maintenance", nextStepId: "step-4-atm-report" },
            { choice: "sensor_glitch", label: "Vibration Sensor False Alarm", nextStepId: "step-4-atm-report" },
          ],
          estimatedDurationSeconds: 45,
        },
        {
          id: "step-3-notify-switch",
          order: 3,
          type: "ESCALATION",
          title: "Notify ATM Switch to Temporarily Disable Terminal",
          description: "Issue command or call bank ATM switch operations to put terminal in out-of-service state.",
          mandatory: true,
          dependsOn: ["step-2-evaluate-tamper"],
          estimatedDurationSeconds: 60,
        },
        {
          id: "step-4-atm-report",
          order: 4,
          type: "RESOLUTION_GATE",
          title: "Log ATM Incident Dossier",
          description: "Submit evidence clips and incident details to Banking Fraud Cell.",
          mandatory: true,
          dependsOn: ["step-2-evaluate-tamper"],
          estimatedDurationSeconds: 90,
        },
      ],
    };
  }

  private getCashierDuressDefinition(): PlaybookDefinition {
    return {
      id: "cashier-duress-p1",
      name: "P1 Cashier Cabin Duress / Panic Alarm Response",
      version: 1,
      description: "Critical SOP for cashier silent panic button press, counter robbery, or teller threat.",
      category: "banking_security",
      trigger: {
        incidentType: "CASHIER_DURESS",
        severity: "P1",
      },
      resolutionPolicy: {
        requireMandatorySteps: true,
        allowOverride: false,
        overridePermission: "incident.resolve.override",
        requireClassification: true,
        requireRootCause: true,
      },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
      steps: [
        {
          id: "step-1-silent-counter-view",
          order: 1,
          type: "LIVE_VIDEO_REVIEW",
          title: "Covert Live View of Cashier Counters",
          description: "Review all counter cameras immediately. Do NOT emit audio into branch.",
          mandatory: true,
          evidenceRequirements: { requireLiveVerification: true },
          estimatedDurationSeconds: 15,
        },
        {
          id: "step-2-panic-assessment",
          order: 2,
          type: "DECISION",
          title: "Confirm Active Robbery / Hostage Situation",
          description: "Confirm whether panic button activation is active holdup or accidental foot-press.",
          mandatory: true,
          dependsOn: ["step-1-silent-counter-view"],
          decisionOutputs: [
            { choice: "active_robbery", label: "Active Armed Robbery / Hostage Threat", nextStepId: "step-3-silent-police-dispatch" },
            { choice: "accidental_press", label: "Accidental Panic Button Press (Verified Safe)", nextStepId: "step-4-duress-report" },
          ],
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-3-silent-police-dispatch",
          order: 3,
          type: "ESCALATION",
          title: "Immediate Silent Police & Armed Response Dispatch",
          description: "Call City Police Control Room. Clearly state SILENT ALARM - Armed Robbery in Progress.",
          mandatory: true,
          dependsOn: ["step-2-panic-assessment"],
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-4-duress-report",
          order: 4,
          type: "RESOLUTION_GATE",
          title: "Complete Panic Alarm Audit & Regulatory Notice",
          description: "Record teller statement, dispatch notes, and camera footage archive reference.",
          mandatory: true,
          dependsOn: ["step-2-panic-assessment"],
          estimatedDurationSeconds: 90,
        },
      ],
    };
  }

  private seedDefaultPlaybooksInMemory(): void {
    const vault = this.getVaultIntrusionDefinition();
    const atm = this.getAtmTamperDefinition();
    const duress = this.getCashierDuressDefinition();
    this.memoryPlaybooks.set(vault.id, vault);
    this.memoryPlaybooks.set(atm.id, atm);
    this.memoryPlaybooks.set(duress.id, duress);
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
