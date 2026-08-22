import type {
  PlaybookInstance,
  IncidentAuditEvent,
} from "../domain/playbook.types.js";
import type { PlaybookDefinitionRepository } from "../repositories/playbook-definition.repository.js";
import type { IncidentAuditRepository } from "../repositories/incident-audit.repository.js";

export class IncidentResolutionBlockedError extends Error {
  readonly incidentId: string;
  readonly incompleteSteps: Array<{ stepId: string; title: string; type: string }>;

  constructor(
    incidentId: string,
    incompleteSteps: Array<{ stepId: string; title: string; type: string }>,
  ) {
    const titles = incompleteSteps.map((s) => `'${s.title}'`).join(", ");
    super(
      `Cannot resolve incident ${incidentId}: Mandatory SOP steps are not completed: ${titles}. Complete all mandatory steps or provide an authorized supervisor override.`,
    );
    this.name = "IncidentResolutionBlockedError";
    this.incidentId = incidentId;
    this.incompleteSteps = incompleteSteps;
  }
}

export class IncidentResolutionService {
  constructor(
    private readonly playbookDefinitions: PlaybookDefinitionRepository,
    private readonly auditRepo: IncidentAuditRepository,
  ) {}

  /**
   * Check whether an incident's playbook satisfies all mandatory resolution gates.
   */
  async validateResolutionGates(
    instance: PlaybookInstance,
  ): Promise<{
    canResolve: boolean;
    incompleteMandatorySteps: Array<{ stepId: string; title: string; type: string }>;
  }> {
    const definition = await this.playbookDefinitions.getById(instance.playbookId);
    if (!definition) {
      return { canResolve: true, incompleteMandatorySteps: [] };
    }

    const incomplete: Array<{ stepId: string; title: string; type: string }> = [];

    for (const stepDef of definition.steps) {
      if (stepDef.mandatory) {
        const stepInst = instance.stepInstances[stepDef.id];
        const isDone = stepInst && (stepInst.status === "COMPLETED" || stepInst.status === "OVERRIDDEN");
        if (!isDone) {
          incomplete.push({
            stepId: stepDef.id,
            title: stepDef.title,
            type: stepDef.type,
          });
        }
      }
    }

    return {
      canResolve: incomplete.length === 0,
      incompleteMandatorySteps: incomplete,
    };
  }

  /**
   * Enforce resolution gate. Throws IncidentResolutionBlockedError if mandatory steps are incomplete.
   */
  async enforceResolution(
    instance: PlaybookInstance,
    actor: { userId: string; userName: string; role?: string },
    resolutionNotes?: string,
  ): Promise<void> {
    const { canResolve, incompleteMandatorySteps } = await this.validateResolutionGates(instance);

    if (!canResolve) {
      await this.auditRepo.append({
        incidentId: instance.incidentId,
        tenantId: instance.tenantId,
        eventType: "RESOLUTION_BLOCKED",
        actor: { type: "USER", userId: actor.userId, userName: actor.userName },
        details: {
          reason: "mandatory_steps_incomplete",
          incompleteSteps: incompleteMandatorySteps,
          attemptedAt: new Date().toISOString(),
        },
      });

      throw new IncidentResolutionBlockedError(instance.incidentId, incompleteMandatorySteps);
    }

    // Record successful resolution audit event
    await this.auditRepo.append({
      incidentId: instance.incidentId,
      tenantId: instance.tenantId,
      eventType: "INCIDENT_RESOLVED",
      actor: { type: "USER", userId: actor.userId, userName: actor.userName },
      details: {
        playbookId: instance.playbookId,
        playbookVersion: instance.playbookVersion,
        completedStepsCount: Object.values(instance.stepInstances).filter(
          (s) => s.status === "COMPLETED" || s.status === "OVERRIDDEN",
        ).length,
        notes: resolutionNotes || "All mandatory SOP steps verified and completed.",
        resolvedAt: new Date().toISOString(),
      },
    });
  }
}
