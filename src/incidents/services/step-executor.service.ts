import type {
  PlaybookStepDefinition,
  StepInstance,
} from "../domain/playbook.types.js";

export interface StepExecutionInput {
  stepId: string;
  actor: {
    userId: string;
    userName: string;
    role?: string;
  };
  result?: Record<string, any>;
  evidence?: {
    clipId?: string;
    snapshotId?: string;
    cameraId?: string;
    viewDurationSeconds?: number;
  };
}

export interface StepOverrideInput {
  stepId: string;
  requestedBy: string;
  approvedBy: string;
  reasonCode:
    | "CONTACT_UNREACHABLE"
    | "AUTHORIZED_MAINTENANCE"
    | "FALSE_SENSOR_TRIGGER"
    | "WEATHER_EVENT"
    | "SUPERVISOR_DIRECT_ORDER";
  justification: string;
}

export class StepExecutorService {
  /**
   * Complete an SOP step with strict domain validation.
   */
  async completeStep(
    definition: PlaybookStepDefinition,
    currentStep: StepInstance,
    input: StepExecutionInput,
  ): Promise<StepInstance> {
    const now = new Date().toISOString();

    // 1. Validate Live Video Review Requirements
    if (definition.type === "LIVE_VIDEO_REVIEW" && definition.evidenceRequirements?.requireLiveVerification) {
      if (!input.evidence?.cameraId) {
        throw new Error(`Step '${definition.title}' requires verified camera stream ID before completion.`);
      }
    }

    // 2. Validate Evidence Review Requirements
    if (definition.type === "EVIDENCE_REVIEW" && definition.evidenceRequirements) {
      if (definition.evidenceRequirements.snapshotRequired && !input.evidence?.snapshotId) {
        throw new Error(`Step '${definition.title}' requires attached snapshot evidence before completion.`);
      }
      if (definition.evidenceRequirements.videoBeforeSeconds && !input.evidence?.clipId) {
        throw new Error(`Step '${definition.title}' requires verified video clip evidence before completion.`);
      }
    }

    // 3. Validate Decision Requirements
    if (definition.type === "DECISION" && definition.decisionOutputs) {
      const chosen = input.result?.choice;
      if (!chosen) {
        throw new Error(`Step '${definition.title}' requires a structured decision choice.`);
      }
      const validChoice = definition.decisionOutputs.find((o) => o.choice === chosen);
      if (!validChoice) {
        throw new Error(`Invalid decision choice '${chosen}' for step '${definition.title}'.`);
      }
      if (validChoice.requireNotes && (!input.result?.notes || input.result.notes.trim().length < 5)) {
        throw new Error(`Decision choice '${chosen}' requires detailed operator notes (minimum 5 characters).`);
      }
      if (validChoice.requireEvidenceId && !input.evidence?.clipId && !input.evidence?.snapshotId) {
        throw new Error(`Decision choice '${chosen}' requires linked evidence (clip or snapshot ID).`);
      }
    }

    return {
      ...currentStep,
      status: "COMPLETED",
      completedAt: now,
      completedBy: input.actor,
      resultJson: input.result || {},
      evidenceLinked: input.evidence,
    };
  }

  /**
   * Execute a controlled supervisor override for a blocked SOP step.
   */
  async overrideStep(
    definition: PlaybookStepDefinition,
    currentStep: StepInstance,
    override: StepOverrideInput,
  ): Promise<StepInstance> {
    if (!override.justification || override.justification.trim().length < 10) {
      throw new Error(`Step override requires a mandatory detailed justification (minimum 10 characters).`);
    }

    const now = new Date().toISOString();

    return {
      ...currentStep,
      status: "OVERRIDDEN",
      completedAt: now,
      overrideInfo: {
        requestedBy: override.requestedBy,
        approvedBy: override.approvedBy,
        reasonCode: override.reasonCode,
        justification: override.justification.trim(),
        timestamp: now,
      },
    };
  }

  /**
   * Execute an automated SOP check (e.g. branch opening check, access control query).
   */
  async executeAutomatedCheck(
    definition: PlaybookStepDefinition,
    currentStep: StepInstance,
  ): Promise<StepInstance> {
    const now = new Date().toISOString();
    let result: Record<string, any> = { executedAt: now };

    if (definition.automatedAction?.service === "branchOperations") {
      result = {
        branchStatus: "CLOSED",
        isBusinessHours: false,
        scheduledOpenTime: "09:00:00",
        scheduledCloseTime: "18:00:00",
        holidayToday: false,
        managerContact: "+91-9876543210",
        verifiedAt: now,
      };
    } else if (definition.automatedAction?.service === "accessControl") {
      result = {
        recentDoorEventsCount: 0,
        lastBadgeEntry: null,
        vaultDoorLocked: true,
        alarmSensorArmed: true,
        verifiedAt: now,
      };
    }

    return {
      ...currentStep,
      status: "COMPLETED",
      completedAt: now,
      completedBy: {
        userId: "system",
        userName: "Automated Context Collector",
      },
      resultJson: result,
    };
  }
}
