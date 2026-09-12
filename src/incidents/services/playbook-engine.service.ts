import { randomUUID } from "node:crypto";
import type {
  PlaybookInstance,
  StepInstance,
  IncidentDecisionRecord,
  IncidentStateWorkspace,
} from "../domain/playbook.types.js";
import type { Pool } from "pg";
import { PlaybookDefinitionRepository } from "../repositories/playbook-definition.repository.js";
import { PlaybookInstanceRepository } from "../repositories/playbook-instance.repository.js";
import { IncidentAuditRepository } from "../repositories/incident-audit.repository.js";
import { PostgresPlaybookDefinitionRepository } from "../repositories/postgres-playbook-definition.repository.js";
import { PostgresPlaybookInstanceRepository } from "../repositories/postgres-playbook-instance.repository.js";
import { PostgresIncidentAuditRepository } from "../repositories/postgres-incident-audit.repository.js";
import { StepExecutorService, type StepExecutionInput, type StepOverrideInput } from "./step-executor.service.js";
import { IncidentResolutionService } from "./incident-resolution.service.js";

export type PlaybookDefRepo = PostgresPlaybookDefinitionRepository | PlaybookDefinitionRepository;
export type PlaybookInstRepo = PostgresPlaybookInstanceRepository | PlaybookInstanceRepository;
export type IncidentAuditRepo = PostgresIncidentAuditRepository | IncidentAuditRepository;

export class PlaybookEngineService {
  readonly definitions: PlaybookDefRepo;
  readonly instances: PlaybookInstRepo;
  readonly audit: IncidentAuditRepo;
  readonly stepExecutor: StepExecutorService;
  readonly resolutionService: IncidentResolutionService;
  readonly pool?: Pool;

  // In-memory fallback for test / standalone only
  private readonly decisions = new Map<string, IncidentDecisionRecord[]>();

  constructor(
    definitions?: PlaybookDefRepo,
    instances?: PlaybookInstRepo,
    audit?: IncidentAuditRepo,
    pool?: Pool,
  ) {
    this.pool = pool;
    if (this.pool) {
      this.definitions = definitions || new PostgresPlaybookDefinitionRepository(this.pool);
      this.instances = instances || new PostgresPlaybookInstanceRepository(this.pool);
      this.audit = audit || new PostgresIncidentAuditRepository(this.pool);
    } else {
      if (process.env.NODE_ENV === "production" && (!definitions || !instances || !audit)) {
        throw new Error("INCIDENT_STORE_UNAVAILABLE: PlaybookEngineService requires durable PostgreSQL repositories in production");
      }
      this.definitions = definitions || new PlaybookDefinitionRepository();
      this.instances = instances || new PlaybookInstanceRepository();
      this.audit = audit || new IncidentAuditRepository();
    }
    this.stepExecutor = new StepExecutorService();
    this.resolutionService = new IncidentResolutionService(this.definitions as any, this.audit as any);
  }

  /**
   * Start a stateful SOP Playbook instance for an incident.
   */
  async startPlaybook(incident: {
    id: string;
    tenantId: string;
    incidentType: string;
    severity?: string;
    title?: string;
    branchId?: string;
  }): Promise<PlaybookInstance> {
    const definition = await this.definitions.findByTrigger(
      incident.incidentType,
      incident.severity,
    );

    if (!definition) {
      throw new Error(`No matching active playbook found for incident type ${incident.incidentType}`);
    }

    const instanceId = randomUUID();
    const now = new Date().toISOString();

    const stepInstances: Record<string, StepInstance> = {};
    for (const step of definition.steps) {
      stepInstances[step.id] = {
        stepId: step.id,
        order: step.order,
        type: step.type,
        title: step.title,
        description: step.description,
        mandatory: step.mandatory,
        status: "PENDING",
      };
    }

    // Set first step as in-progress or ready
    const firstStep = definition.steps.find((s) => s.order === 1) || definition.steps[0];
    const currentStepIds = firstStep ? [firstStep.id] : [];
    if (firstStep && stepInstances[firstStep.id]) {
      const firstStepInst = stepInstances[firstStep.id]!;
      firstStepInst.status = "IN_PROGRESS";
      firstStepInst.startedAt = now;
    }

    const instance: PlaybookInstance = {
      instanceId,
      incidentId: incident.id,
      tenantId: incident.tenantId,
      playbookId: definition.id,
      playbookName: definition.name,
      playbookVersion: definition.version,
      status: "RUNNING",
      currentStepIds,
      completedStepIds: [],
      stepInstances,
      contextData: {
        incidentType: incident.incidentType,
        severity: incident.severity,
        branchId: incident.branchId,
      },
      startedAt: now,
      version: 1,
    };

    await this.instances.save(instance);

    await this.audit.append({
      incidentId: incident.id,
      tenantId: incident.tenantId,
      branchId: incident.branchId,
      eventType: "PLAYBOOK_INITIALIZED",
      actor: { type: "SYSTEM", userName: "Incident Playbook Engine" },
      details: {
        playbookId: definition.id,
        playbookName: definition.name,
        playbookVersion: definition.version,
        totalSteps: definition.steps.length,
      },
    });

    // Execute any automated initial checks
    await this.executePendingAutomatedChecks(instance);

    return instance;
  }

  /**
   * Start an individual step (mark IN_PROGRESS).
   */
  async startStep(
    incidentId: string,
    stepId: string,
    actor: { userId: string; userName: string },
  ): Promise<PlaybookInstance> {
    const instance = await this.instances.getByIncidentId(incidentId);
    if (!instance) throw new Error(`Playbook instance for incident ${incidentId} not found`);

    const step = instance.stepInstances[stepId];
    if (!step) throw new Error(`Step ${stepId} not found in playbook instance`);

    step.status = "IN_PROGRESS";
    step.startedAt = new Date().toISOString();

    await this.instances.save(instance);

    await this.audit.append({
      incidentId,
      tenantId: instance.tenantId,
      eventType: "STEP_STARTED",
      stepId,
      actor: { type: "USER", userId: actor.userId, userName: actor.userName },
      details: { stepTitle: step.title, stepType: step.type },
    });

    return instance;
  }

  /**
   * Complete an individual step with domain validation.
   */
  async completeStep(
    incidentId: string,
    stepId: string,
    input: StepExecutionInput,
  ): Promise<PlaybookInstance> {
    const instance = await this.instances.getByIncidentId(incidentId);
    if (!instance) throw new Error(`Playbook instance for incident ${incidentId} not found`);

    const definition = await this.definitions.getById(instance.playbookId);
    if (!definition) throw new Error(`Playbook definition ${instance.playbookId} not found`);

    const stepDef = definition.steps.find((s) => s.id === stepId);
    const stepInst = instance.stepInstances[stepId];
    if (!stepDef || !stepInst) throw new Error(`Step ${stepId} not found`);

    // Verify dependencies
    if (stepDef.dependsOn) {
      for (const depId of stepDef.dependsOn) {
        const dep = instance.stepInstances[depId];
        if (!dep || (dep.status !== "COMPLETED" && dep.status !== "OVERRIDDEN")) {
          const depDef = definition.steps.find((s) => s.id === depId);
          throw new Error(`Cannot complete step '${stepDef.title}': Dependent step '${depDef?.title || depId}' must be completed first.`);
        }
      }
    }

    // Execute completion
    const updatedStep = await this.stepExecutor.completeStep(stepDef, stepInst, input);
    instance.stepInstances[stepId] = updatedStep;
    if (!instance.completedStepIds.includes(stepId)) {
      instance.completedStepIds.push(stepId);
    }

    // Advance to next step
    const nextStep = definition.steps.find((s) => s.order === stepDef.order + 1);
    if (nextStep && instance.stepInstances[nextStep.id]) {
      const nextStepInst = instance.stepInstances[nextStep.id]!;
      if (nextStepInst.status === "PENDING") {
        nextStepInst.status = "IN_PROGRESS";
        nextStepInst.startedAt = new Date().toISOString();
        instance.currentStepIds = [nextStep.id];
      }
    }

    await this.instances.save(instance);

    await this.audit.append({
      incidentId,
      tenantId: instance.tenantId,
      eventType: "STEP_COMPLETED",
      stepId,
      actor: { type: "USER", userId: input.actor.userId, userName: input.actor.userName },
      details: {
        stepTitle: stepDef.title,
        stepType: stepDef.type,
        result: input.result,
        evidenceLinked: input.evidence,
      },
    });

    // Execute any newly ready automated checks
    await this.executePendingAutomatedChecks(instance);

    return instance;
  }

  /**
   * Request / apply an authorized supervisor override on a blocked step.
   */
  async overrideStep(
    incidentId: string,
    stepId: string,
    override: StepOverrideInput,
  ): Promise<PlaybookInstance> {
    const instance = await this.instances.getByIncidentId(incidentId);
    if (!instance) throw new Error(`Playbook instance for incident ${incidentId} not found`);

    const definition = await this.definitions.getById(instance.playbookId);
    if (!definition) throw new Error(`Playbook definition ${instance.playbookId} not found`);

    const stepDef = definition.steps.find((s) => s.id === stepId);
    const stepInst = instance.stepInstances[stepId];
    if (!stepDef || !stepInst) throw new Error(`Step ${stepId} not found`);

    const updated = await this.stepExecutor.overrideStep(stepDef, stepInst, override);
    instance.stepInstances[stepId] = updated;
    if (!instance.completedStepIds.includes(stepId)) {
      instance.completedStepIds.push(stepId);
    }

    await this.instances.save(instance);

    await this.audit.append({
      incidentId,
      tenantId: instance.tenantId,
      eventType: "STEP_OVERRIDDEN",
      stepId,
      actor: { type: "USER", userId: override.approvedBy, userName: override.approvedBy },
      details: {
        stepTitle: stepDef.title,
        reasonCode: override.reasonCode,
        justification: override.justification,
        requestedBy: override.requestedBy,
      },
    });

    return instance;
  }

  /**
   * Record a structured operator decision and branch the dynamic SOP.
   */
  async recordDecision(
    incidentId: string,
    stepId: string,
    input: {
      decisionType: IncidentDecisionRecord["decisionType"];
      chosenOption: string;
      confidence: IncidentDecisionRecord["confidence"];
      operatorNotes: string;
      evidenceId?: string;
      actor: { userId: string; userName: string };
    },
  ): Promise<IncidentDecisionRecord> {
    const record: IncidentDecisionRecord = {
      decisionId: randomUUID(),
      incidentId,
      stepId,
      decisionType: input.decisionType,
      chosenOption: input.chosenOption,
      confidence: input.confidence,
      operatorNotes: input.operatorNotes,
      evidenceId: input.evidenceId,
      recordedBy: input.actor,
      recordedAt: new Date().toISOString(),
    };

    const list = this.decisions.get(incidentId) || [];
    list.push(record);
    this.decisions.set(incidentId, list);

    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO incident_playbook_decisions (
             id, instance_id, step_instance_id, decision_key, chosen_option, rationale, threat_level, operator_id, decided_at
           ) VALUES ($1,
             COALESCE((SELECT instance_id FROM incident_playbook_instances WHERE incident_id = $2 LIMIT 1), 'inst-' || $2),
             COALESCE((SELECT id FROM incident_playbook_step_instances WHERE instance_id = (SELECT instance_id FROM incident_playbook_instances WHERE incident_id = $2 LIMIT 1) AND step_id = $3 LIMIT 1), 'step-' || $3),
             $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (id) DO NOTHING`,
          [
            record.decisionId,
            incidentId,
            stepId,
            input.decisionType,
            input.chosenOption,
            input.operatorNotes,
            input.confidence,
            input.actor.userId,
          ],
        );
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_STORE_UNAVAILABLE: Failed to persist decision: ${(err as Error).message}`);
        }
        console.warn("[PlaybookEngineService] DB recordDecision failed:", err);
      }
    }

    // Complete the decision step on the playbook instance
    await this.completeStep(incidentId, stepId, {
      stepId,
      actor: input.actor,
      result: {
        choice: input.chosenOption,
        decisionType: input.decisionType,
        confidence: input.confidence,
        notes: input.operatorNotes,
      },
      evidence: { clipId: input.evidenceId },
    });

    await this.audit.append({
      incidentId,
      tenantId: "tenant-default",
      eventType: "DECISION_RECORDED",
      stepId,
      actor: { type: "USER", userId: input.actor.userId, userName: input.actor.userName },
      details: {
        decisionType: input.decisionType,
        chosenOption: input.chosenOption,
        confidence: input.confidence,
        notes: input.operatorNotes,
        evidenceId: input.evidenceId,
      },
    });

    return record;
  }

  /**
   * Enforce resolution gate to resolve an incident.
   */
  async resolveIncident(
    incidentId: string,
    actor: { userId: string; userName: string; role?: string },
    notes?: string,
  ): Promise<void> {
    const instance = await this.instances.getByIncidentId(incidentId);
    if (!instance) {
      // If no playbook was assigned, allow direct resolution
      return;
    }

    await this.resolutionService.enforceResolution(instance, actor, notes);

    instance.status = "COMPLETED";
    instance.completedAt = new Date().toISOString();
    await this.instances.save(instance);
  }

  /**
   * Get the complete operator workspace state for an incident.
   */
  async getIncidentWorkspace(
    incident: {
      id: string;
      incidentNumber: string;
      title: string;
      incidentType: string;
      severity: string;
      status: string;
      branchId?: string;
      cameraId?: string;
      occurredAt: string;
      assignedOperatorId?: string;
    },
  ): Promise<IncidentStateWorkspace> {
    let instance = await this.instances.getByIncidentId(incident.id);
    if (!instance) {
      instance = await this.startPlaybook({
        id: incident.id,
        tenantId: "tenant-default",
        incidentType: incident.incidentType,
        severity: incident.severity,
        title: incident.title,
        branchId: incident.branchId,
      });
    }

    const { canResolve, incompleteMandatorySteps } = await this.resolutionService.validateResolutionGates(instance);
    const timeline = await this.audit.getTimeline(incident.id);
    let incidentDecisions = this.decisions.get(incident.id) || [];
    if (this.pool) {
      try {
        const decRes = await this.pool.query(
          `SELECT d.id, d.decision_key, d.chosen_option, d.rationale, d.threat_level, d.operator_id, d.decided_at, s.step_id
           FROM incident_playbook_decisions d
           LEFT JOIN incident_playbook_step_instances s ON s.id = d.step_instance_id
           LEFT JOIN incident_playbook_instances i ON i.instance_id = d.instance_id
           WHERE i.incident_id = $1 OR d.instance_id = 'inst-' || $1
           ORDER BY d.decided_at ASC`,
          [incident.id],
        );
        if (decRes.rows.length > 0) {
          incidentDecisions = decRes.rows.map((r) => ({
            decisionId: r.id,
            incidentId: incident.id,
            stepId: r.step_id || "step-unknown",
            decisionType: r.decision_key as any,
            chosenOption: r.chosen_option,
            confidence: (r.threat_level as any) || "HIGH",
            operatorNotes: r.rationale,
            recordedBy: { userId: r.operator_id, userName: r.operator_id },
            recordedAt: new Date(r.decided_at).toISOString(),
          }));
        }
      } catch (err) {
        if (process.env.NODE_ENV === "production") {
          throw new Error(`INCIDENT_STORE_UNAVAILABLE: Failed to read incident decisions: ${(err as Error).message}`);
        }
      }
    }

    const allowedActions: IncidentStateWorkspace["allowedActions"] = [
      "START_STEP",
      "COMPLETE_STEP",
      "RECORD_DECISION",
    ];

    if (canResolve && incident.status !== "RESOLVED" && incident.status !== "CLOSED") {
      allowedActions.push("RESOLVE");
    }

    return {
      incident: {
        id: incident.id,
        incidentNumber: incident.incidentNumber || incident.id,
        title: incident.title,
        incidentType: incident.incidentType,
        severity: (incident.severity as any) || "P1",
        status: (incident.status as any) || "INVESTIGATING",
        branchId: incident.branchId,
        cameraId: incident.cameraId,
        occurredAt: incident.occurredAt,
        assignedOperatorId: incident.assignedOperatorId,
      },
      playbook: {
        instanceId: instance.instanceId,
        playbookId: instance.playbookId,
        playbookName: instance.playbookName,
        playbookVersion: instance.playbookVersion,
        status: instance.status,
        startedAt: instance.startedAt,
      },
      steps: Object.values(instance.stepInstances).sort((a, b) => a.order - b.order),
      currentStepIds: instance.currentStepIds,
      allowedActions,
      blockedResolutionReasons: incompleteMandatorySteps.map(
        (s) => `Mandatory step '${s.title}' is incomplete`,
      ),
      decisions: incidentDecisions,
      auditTimeline: timeline,
    };
  }

  private async executePendingAutomatedChecks(instance: PlaybookInstance): Promise<void> {
    const definition = await this.definitions.getById(instance.playbookId);
    if (!definition) return;

    for (const stepDef of definition.steps) {
      if (stepDef.type === "AUTOMATED_CHECK") {
        const stepInst = instance.stepInstances[stepDef.id];
        if (stepInst && stepInst.status === "PENDING") {
          const executed = await this.stepExecutor.executeAutomatedCheck(stepDef, stepInst);
          instance.stepInstances[stepDef.id] = executed;
          if (!instance.completedStepIds.includes(stepDef.id)) {
            instance.completedStepIds.push(stepDef.id);
          }
          await this.instances.save(instance);

          await this.audit.append({
            incidentId: instance.incidentId,
            tenantId: instance.tenantId,
            eventType: "AUTOMATION_EXECUTED",
            stepId: stepDef.id,
            actor: { type: "SYSTEM", userName: "Automated Context Collector" },
            details: { stepTitle: stepDef.title, result: executed.resultJson },
          });
        }
      }
    }
  }
}
