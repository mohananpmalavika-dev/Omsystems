import type { Pool } from "pg";
import type { PlaybookInstance, StepInstance } from "../domain/playbook.types.js";

export class PostgresPlaybookInstanceRepository {
  private readonly memoryInstances = new Map<string, PlaybookInstance>();
  private readonly incidentIndex = new Map<string, string>();

  constructor(private readonly pool?: Pool) {}

  async save(instance: PlaybookInstance): Promise<void> {
    const nextVersion = (instance.version || 0) + 1;

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        const existingRes = await client.query(
          `SELECT version FROM incident_playbook_instances WHERE instance_id = $1 FOR UPDATE`,
          [instance.instanceId],
        );

        if (existingRes.rows.length > 0) {
          const currentVersion = existingRes.rows[0].version;
          if (currentVersion !== instance.version) {
            throw new Error(
              `Optimistic lock conflict: Playbook instance ${instance.instanceId} was modified by another operator (expected version ${instance.version}, current version ${currentVersion})`,
            );
          }

          await client.query(
            `UPDATE incident_playbook_instances SET
               status = $1,
               version = $2,
               resolution_summary = $3,
               completed_at = $4,
               updated_at = NOW()
             WHERE instance_id = $5 AND version = $6`,
            [
              instance.status,
              nextVersion,
              JSON.stringify(instance.contextData || {}),
              instance.completedAt ? new Date(instance.completedAt) : null,
              instance.instanceId,
              instance.version,
            ],
          );
        } else {
          // Insert new instance
          const playbookVersionId = `${instance.playbookId}:v${instance.playbookVersion || 1}`;
          await client.query(
            `INSERT INTO incident_playbook_instances (
               instance_id, tenant_id, incident_id, playbook_id, playbook_version_id, version, status, resolution_summary, started_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              instance.instanceId,
              instance.tenantId || "global",
              instance.incidentId,
              instance.playbookId,
              playbookVersionId,
              nextVersion,
              instance.status,
              JSON.stringify(instance.contextData || {}),
              new Date(instance.startedAt || Date.now()),
            ],
          );
        }

        // Upsert step instances
        for (const step of Object.values(instance.stepInstances || {})) {
          await client.query(
            `INSERT INTO incident_playbook_step_instances (
               id, instance_id, step_id, step_order, title, type, status, started_at, completed_at, executed_by, notes, verification_outputs
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (instance_id, step_order) DO UPDATE SET
               status = EXCLUDED.status,
               started_at = EXCLUDED.started_at,
               completed_at = EXCLUDED.completed_at,
               executed_by = EXCLUDED.executed_by,
               notes = EXCLUDED.notes,
               verification_outputs = EXCLUDED.verification_outputs`,
            [
              `${instance.instanceId}-${step.stepId}`,
              instance.instanceId,
              step.stepId,
              step.order,
              step.title,
              step.type,
              step.status,
              step.startedAt ? new Date(step.startedAt) : null,
              step.completedAt ? new Date(step.completedAt) : null,
              step.completedBy?.userId || null,
              step.overrideInfo?.justification || null,
              JSON.stringify(step.resultJson || {}),
            ],
          );
        }

        await client.query("COMMIT");
        instance.version = nextVersion;
        return;
      } catch (err) {
        await client.query("ROLLBACK");
        if ((err as Error).message.includes("Optimistic lock conflict")) {
          throw err;
        }
        console.warn("[PostgresPlaybookInstanceRepo] DB save failed, falling back to memory:", err);
      } finally {
        client.release();
      }
    }

    // In-memory fallback
    const existing = this.memoryInstances.get(instance.instanceId);
    if (existing && existing.version !== instance.version) {
      throw new Error(
        `Optimistic lock conflict: Playbook instance ${instance.instanceId} was modified by another operator (expected version ${instance.version}, current version ${existing.version})`,
      );
    }

    instance.version = nextVersion;
    const cloned: PlaybookInstance = JSON.parse(JSON.stringify(instance));
    this.memoryInstances.set(instance.instanceId, cloned);
    this.incidentIndex.set(instance.incidentId, instance.instanceId);
  }

  async getById(instanceId: string): Promise<PlaybookInstance | null> {
    if (this.pool) {
      try {
        const instRes = await this.pool.query(
          `SELECT instance_id, tenant_id, incident_id, playbook_id, version, status, resolution_summary, started_at, completed_at
           FROM incident_playbook_instances WHERE instance_id = $1`,
          [instanceId],
        );
        if (instRes.rows.length === 0) return null;
        const instRow = instRes.rows[0];

        const stepsRes = await this.pool.query(
          `SELECT id, step_id, step_order, title, type, status, started_at, completed_at, executed_by, notes, verification_outputs
           FROM incident_playbook_step_instances WHERE instance_id = $1 ORDER BY step_order ASC`,
          [instanceId],
        );

        const stepInstances: Record<string, StepInstance> = {};
        const completedStepIds: string[] = [];
        const currentStepIds: string[] = [];

        for (const s of stepsRes.rows) {
          const stepInst: StepInstance = {
            stepId: s.step_id,
            order: s.step_order,
            type: s.type,
            title: s.title,
            description: "",
            mandatory: true,
            status: s.status,
            startedAt: s.started_at ? new Date(s.started_at).toISOString() : undefined,
            completedAt: s.completed_at ? new Date(s.completed_at).toISOString() : undefined,
            completedBy: s.executed_by ? { userId: s.executed_by, userName: s.executed_by } : undefined,
            resultJson: s.verification_outputs,
          };
          stepInstances[s.step_id] = stepInst;
          if (s.status === "COMPLETED") completedStepIds.push(s.step_id);
          if (s.status === "IN_PROGRESS") currentStepIds.push(s.step_id);
        }

        return {
          instanceId: instRow.instance_id,
          tenantId: instRow.tenant_id,
          incidentId: instRow.incident_id,
          playbookId: instRow.playbook_id,
          playbookName: instRow.playbook_id,
          playbookVersion: 1,
          status: instRow.status,
          currentStepIds: currentStepIds.length > 0 ? currentStepIds : [stepsRes.rows[0]?.step_id || ""],
          completedStepIds,
          stepInstances,
          contextData: instRow.resolution_summary || {},
          startedAt: new Date(instRow.started_at).toISOString(),
          completedAt: instRow.completed_at ? new Date(instRow.completed_at).toISOString() : undefined,
          version: instRow.version,
        };
      } catch (err) {
        console.warn("[PostgresPlaybookInstanceRepo] DB getById failed:", err);
      }
    }

    const instance = this.memoryInstances.get(instanceId);
    return instance ? JSON.parse(JSON.stringify(instance)) : null;
  }

  async getByIncidentId(incidentId: string): Promise<PlaybookInstance | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT instance_id FROM incident_playbook_instances WHERE incident_id = $1 LIMIT 1`,
          [incidentId],
        );
        if (res.rows.length > 0) {
          return this.getById(res.rows[0].instance_id);
        }
      } catch (err) {
        console.warn("[PostgresPlaybookInstanceRepo] DB getByIncidentId failed:", err);
      }
    }

    const instanceId = this.incidentIndex.get(incidentId);
    if (!instanceId) return null;
    return this.getById(instanceId);
  }

  async delete(instanceId: string): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(`DELETE FROM incident_playbook_instances WHERE instance_id = $1`, [instanceId]);
      } catch (err) {
        console.warn("[PostgresPlaybookInstanceRepo] DB delete failed:", err);
      }
    }

    const instance = this.memoryInstances.get(instanceId);
    if (instance) {
      this.incidentIndex.delete(instance.incidentId);
      this.memoryInstances.delete(instanceId);
    }
  }
}
