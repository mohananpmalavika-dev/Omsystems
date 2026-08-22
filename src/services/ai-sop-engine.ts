/**
 * AI SOP (Standard Operating Procedure) Engine
 * 
 * Automatically guides operators through incident response with:
 * - Interactive step-by-step procedures
 * - Conditional logic and branching
 * - Automatic escalation
 * - SLA tracking
 * - Audit trail
 */

import { randomUUID } from "node:crypto";
import type { ControlPlaneStore } from "../control-plane-store.js";

export interface SOPDefinition {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  version: number;
  status: "draft" | "active" | "archived";
  incidentTypes: string[];
  severityLevels: string[];
  applicableBranchTypes?: string[];
  applicableZones?: string[];
  conditions?: SOPCondition[];
  steps: SOPStep[];
  escalationRules: SOPEscalationRule[];
  slaMinutes?: number;
  createdBy: string;
  createdAt: string;
  publishedAt?: string;
  publishedBy?: string;
  archivedAt?: string;
  updatedAt: string;
}

export interface SOPCondition {
  field: string;
  operator: "equals" | "contains" | "greater_than" | "less_than" | "in";
  value: any;
}

export interface SOPStep {
  stepNumber: number;
  title: string;
  description: string;
  stepType: "instruction" | "checklist" | "approval" | "phone-call" | "notification" | "video-verification" | "evidence-collection" | "form" | "external-escalation" | "work-order" | "incident-closure";
  isMandatory: boolean;
  isConditional: boolean;
  conditions?: SOPCondition[];
  expectedDurationMinutes?: number;
  actions?: SOPStepAction[];
  checklistItems?: string[];
  approvalRequired?: {
    role: string;
    timeout: number;
  };
  phoneCallDetails?: {
    recipient: string;
    phoneNumber?: string;
    requiresConfirmation: boolean;
  };
  notificationDetails?: {
    recipients: string[];
    channels: ("sms" | "email" | "push" | "voice")[];
    template?: string;
  };
  videoVerificationDetails?: {
    cameraIds: string[];
    requiresSnapshot: boolean;
    requiresClip: boolean;
  };
  evidenceCollectionDetails?: {
    evidenceTypes: string[];
    preserveVideo: boolean;
    preRollMinutes?: number;
    postRollMinutes?: number;
  };
  formDetails?: {
    fields: Array<{
      name: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  };
  skipReason?: string;
}

export interface SOPStepAction {
  actionType: "open-camera" | "open-camera-group" | "create-incident" | "send-notification" | "apply-legal-hold" | "create-work-order";
  parameters: Record<string, any>;
}

export interface SOPEscalationRule {
  triggerCondition: "time-exceeded" | "step-failed" | "no-acknowledgment" | "severity-increased" | "manual-escalation";
  thresholdMinutes?: number;
  escalateTo: string[];
  notificationChannels: ("sms" | "email" | "push" | "voice")[];
  message: string;
  requiresApproval?: boolean;
}

export interface SOPExecution {
  id: string;
  sopId: string;
  sopVersion: number;
  tenantId: string;
  incidentId?: string;
  alertId?: string;
  branchId?: string;
  status: "in-progress" | "completed" | "cancelled" | "escalated" | "failed";
  startedAt: string;
  completedAt?: string;
  startedBy: string;
  currentStepNumber: number;
  completedSteps: number;
  totalSteps: number;
  progress: number;
  slaDeadline?: string;
  slaStatus: "on-time" | "at-risk" | "breached";
  escalated: boolean;
  escalationHistory: SOPEscalation[];
  stepResults: SOPStepResult[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SOPStepResult {
  stepNumber: number;
  status: "pending" | "in-progress" | "completed" | "skipped" | "failed";
  startedAt?: string;
  completedAt?: string;
  completedBy?: string;
  result?: "confirmed" | "false-alert" | "unable-to-verify" | "person-located" | "not-located" | "approved" | "rejected";
  response?: any;
  evidence?: {
    snapshotIds?: string[];
    clipIds?: string[];
    documents?: string[];
  };
  comments?: string;
  skipReason?: string;
  duration?: number;
}

export interface SOPEscalation {
  escalatedAt: string;
  escalatedBy: string;
  reason: string;
  recipients: string[];
  channels: string[];
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export class AISOPEngineService {
  constructor(private store: ControlPlaneStore) {}

  /**
   * Create SOP definition
   */
  async createSOPDefinition(
    tenantId: string,
    createdBy: string,
    input: Omit<SOPDefinition, "id" | "tenantId" | "version" | "status" | "createdBy" | "createdAt" | "updatedAt">
  ): Promise<SOPDefinition> {
    const now = new Date().toISOString();

    const sop: SOPDefinition = {
      id: randomUUID(),
      tenantId,
      version: 1,
      status: "draft",
      createdBy,
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    // Store would handle persistence
    return sop;
  }

  /**
   * Publish SOP (make active)
   */
  async publishSOP(sopId: string, publishedBy: string): Promise<SOPDefinition | undefined> {
    // Implementation would update status to active
    // and set publishedAt, publishedBy
    return undefined; // Placeholder
  }

  /**
   * Select appropriate SOP for incident
   */
  async selectSOP(
    tenantId: string,
    incidentType: string,
    severity: string,
    context: {
      branchId?: string;
      branchType?: string;
      zoneType?: string;
      timeOfDay?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<SOPDefinition | undefined> {
    // Implementation would:
    // 1. Query active SOPs for tenant
    // 2. Filter by incident type and severity
    // 3. Evaluate conditions against context
    // 4. Return best match based on specificity
    return undefined; // Placeholder
  }

  /**
   * Start SOP execution
   */
  async startSOPExecution(
    tenantId: string,
    sopId: string,
    startedBy: string,
    context: {
      incidentId?: string;
      alertId?: string;
      branchId?: string;
    }
  ): Promise<SOPExecution> {
    const now = new Date().toISOString();

    // Get SOP definition
    // const sop = await this.getSOPDefinition(sopId);

    // Create execution
    const execution: SOPExecution = {
      id: randomUUID(),
      sopId,
      sopVersion: 1, // Would come from SOP definition
      tenantId,
      incidentId: context.incidentId,
      alertId: context.alertId,
      branchId: context.branchId,
      status: "in-progress",
      startedAt: now,
      startedBy,
      currentStepNumber: 1,
      completedSteps: 0,
      totalSteps: 0, // Would come from SOP definition
      progress: 0,
      slaStatus: "on-time",
      escalated: false,
      escalationHistory: [],
      stepResults: [],
      createdAt: now,
      updatedAt: now,
    };

    // Initialize step results
    // for (let i = 1; i <= sop.steps.length; i++) {
    //   execution.stepResults.push({
    //     stepNumber: i,
    //     status: "pending",
    //   });
    // }

    return execution;
  }

  /**
   * Get current step for execution
   */
  async getCurrentStep(
    executionId: string
  ): Promise<{ step: SOPStep; result: SOPStepResult } | undefined> {
    // Implementation would:
    // 1. Get execution
    // 2. Get SOP definition
    // 3. Find current step based on currentStepNumber
    // 4. Evaluate conditions to see if step should be shown
    // 5. Return step and its result
    return undefined; // Placeholder
  }

  /**
   * Complete step
   */
  async completeStep(
    executionId: string,
    stepNumber: number,
    completedBy: string,
    input: {
      result: SOPStepResult["result"];
      response?: any;
      evidence?: SOPStepResult["evidence"];
      comments?: string;
    }
  ): Promise<SOPExecution> {
    const now = new Date().toISOString();

    // Implementation would:
    // 1. Get execution
    // 2. Validate step is current
    // 3. Update step result
    // 4. Move to next step (checking conditions)
    // 5. Check if SOP is complete
    // 6. Check SLA status
    // 7. Trigger escalation if needed

    // Placeholder execution
    const execution: SOPExecution = {
      id: executionId,
      sopId: "placeholder",
      sopVersion: 1,
      tenantId: "placeholder",
      status: "in-progress",
      startedAt: now,
      startedBy: completedBy,
      currentStepNumber: stepNumber + 1,
      completedSteps: stepNumber,
      totalSteps: 10,
      progress: (stepNumber / 10) * 100,
      slaStatus: "on-time",
      escalated: false,
      escalationHistory: [],
      stepResults: [],
      createdAt: now,
      updatedAt: now,
    };

    return execution;
  }

  /**
   * Skip step with reason
   */
  async skipStep(
    executionId: string,
    stepNumber: number,
    skippedBy: string,
    reason: string
  ): Promise<SOPExecution> {
    // Implementation would:
    // 1. Check if step can be skipped (not mandatory)
    // 2. Update step result status to 'skipped'
    // 3. Record reason
    // 4. Move to next step

    return this.completeStep(executionId, stepNumber, skippedBy, {
      result: "person-located",
    });
  }

  /**
   * Escalate SOP execution
   */
  async escalateExecution(
    executionId: string,
    escalatedBy: string,
    reason: string,
    recipients: string[]
  ): Promise<SOPExecution> {
    const now = new Date().toISOString();

    // Implementation would:
    // 1. Get execution
    // 2. Add escalation to history
    // 3. Update status to 'escalated'
    // 4. Send notifications to recipients
    // 5. Create audit log entry

    const escalation: SOPEscalation = {
      escalatedAt: now,
      escalatedBy,
      reason,
      recipients,
      channels: ["sms", "email", "push"],
      acknowledged: false,
    };

    // Return updated execution
    return {} as SOPExecution; // Placeholder
  }

  /**
   * Complete SOP execution
   */
  async completeExecution(
    executionId: string,
    completedBy: string,
    summary?: string
  ): Promise<SOPExecution> {
    const now = new Date().toISOString();

    // Implementation would:
    // 1. Validate all mandatory steps are completed
    // 2. Update status to 'completed'
    // 3. Set completedAt
    // 4. Calculate final SLA status
    // 5. Close related incident if configured

    return {} as SOPExecution; // Placeholder
  }

  /**
   * Cancel SOP execution
   */
  async cancelExecution(
    executionId: string,
    cancelledBy: string,
    reason: string
  ): Promise<SOPExecution> {
    // Implementation would:
    // 1. Update status to 'cancelled'
    // 2. Record reason
    // 3. Create audit log entry

    return {} as SOPExecution; // Placeholder
  }

  /**
   * Check SLA status and trigger escalation if needed
   */
  async checkSLAStatus(executionId: string): Promise<void> {
    // Implementation would:
    // 1. Get execution with SOP definition
    // 2. Calculate time elapsed
    // 3. Compare with SLA deadline
    // 4. Update slaStatus
    // 5. Trigger escalation if breached and rule exists
  }

  /**
   * Evaluate step conditions
   */
  private evaluateConditions(
    conditions: SOPCondition[],
    context: Record<string, any>
  ): boolean {
    return conditions.every((condition) => {
      const value = context[condition.field];

      switch (condition.operator) {
        case "equals":
          return value === condition.value;
        case "contains":
          return String(value).includes(String(condition.value));
        case "greater_than":
          return Number(value) > Number(condition.value);
        case "less_than":
          return Number(value) < Number(condition.value);
        case "in":
          return Array.isArray(condition.value)
            ? condition.value.includes(value)
            : false;
        default:
          return false;
      }
    });
  }

  /**
   * Get next applicable step
   */
  private getNextStep(
    sop: SOPDefinition,
    currentStepNumber: number,
    context: Record<string, any>
  ): SOPStep | undefined {
    for (let i = currentStepNumber; i <= sop.steps.length; i++) {
      const step = sop.steps.find((s) => s.stepNumber === i);
      if (!step) continue;

      // Check if step is conditional
      if (step.isConditional && step.conditions) {
        if (!this.evaluateConditions(step.conditions, context)) {
          continue; // Skip this step
        }
      }

      return step;
    }

    return undefined; // All steps completed
  }

  /**
   * Execute step actions
   */
  private async executeStepActions(
    step: SOPStep,
    execution: SOPExecution
  ): Promise<void> {
    if (!step.actions) return;

    for (const action of step.actions) {
      switch (action.actionType) {
        case "send-notification":
          // Send notification using notification service
          break;
        case "apply-legal-hold":
          // Apply legal hold to video
          if (execution.incidentId) {
            // await this.store.addIncidentVideoRange(...);
          }
          break;
        case "create-work-order":
          // Create maintenance work order
          break;
        // Add other action types
      }
    }
  }

  /**
   * Generate SOP execution summary
   */
  generateExecutionSummary(execution: SOPExecution): string {
    const duration = execution.completedAt
      ? (new Date(execution.completedAt).getTime() -
          new Date(execution.startedAt).getTime()) /
        60000
      : 0;

    const completionRate = (execution.completedSteps / execution.totalSteps) * 100;

    const skippedSteps = execution.stepResults.filter(
      (r) => r.status === "skipped"
    ).length;

    return `SOP execution ${execution.status}. ${execution.completedSteps}/${execution.totalSteps} steps completed (${Math.round(completionRate)}%). ${skippedSteps} steps skipped. Duration: ${Math.round(duration)} minutes. SLA: ${execution.slaStatus}.`;
  }

  /**
   * Get predefined SOPs for common scenarios
   */
  getPredefinedSOPs(): Array<Partial<SOPDefinition>> {
    return [
      // Critical Intrusion SOP
      {
        name: "Critical Intrusion Response",
        description: "Response procedure for confirmed intrusions in restricted areas",
        incidentTypes: ["security-intrusion", "restricted-access"],
        severityLevels: ["critical", "high"],
        slaMinutes: 15,
        steps: [
          {
            stepNumber: 1,
            title: "Verify Live Video",
            description: "Verify whether a person is visible inside the restricted zone",
            stepType: "video-verification",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 1,
            videoVerificationDetails: {
              cameraIds: [],
              requiresSnapshot: true,
              requiresClip: false,
            },
            actions: [
              {
                actionType: "open-camera",
                parameters: {},
              },
            ],
          },
          {
            stepNumber: 2,
            title: "Check Nearby Cameras",
            description: "Check Cameras for movement and person tracking",
            stepType: "video-verification",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 2,
          },
          {
            stepNumber: 3,
            title: "Call Branch Manager",
            description: "Immediately notify the branch manager",
            stepType: "phone-call",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 2,
            phoneCallDetails: {
              recipient: "Branch Manager",
              requiresConfirmation: true,
            },
          },
          {
            stepNumber: 4,
            title: "Escalate to Police",
            description: "Call local police for immediate response",
            stepType: "external-escalation",
            isMandatory: true,
            isConditional: true,
            conditions: [
              {
                field: "step1Result",
                operator: "equals",
                value: "confirmed",
              },
            ],
            expectedDurationMinutes: 3,
          },
          {
            stepNumber: 5,
            title: "Preserve Evidence",
            description: "Apply legal hold and preserve video evidence",
            stepType: "evidence-collection",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 1,
            evidenceCollectionDetails: {
              evidenceTypes: ["video", "snapshots"],
              preserveVideo: true,
              preRollMinutes: 10,
              postRollMinutes: 10,
            },
          },
          {
            stepNumber: 6,
            title: "Close Incident",
            description: "Document outcome and close the incident",
            stepType: "incident-closure",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 2,
          },
        ],
        escalationRules: [
          {
            triggerCondition: "time-exceeded",
            thresholdMinutes: 5,
            escalateTo: ["supervisor", "regional-manager"],
            notificationChannels: ["sms", "voice"],
            message: "Critical intrusion alert not acknowledged within 5 minutes",
          },
        ],
      },

      // Fire/Smoke Emergency SOP
      {
        name: "Fire/Smoke Emergency Response",
        description: "Emergency response for fire and smoke detection",
        incidentTypes: ["fire-emergency"],
        severityLevels: ["critical"],
        slaMinutes: 5,
        steps: [
          {
            stepNumber: 1,
            title: "Verify Fire/Smoke",
            description: "Immediately verify fire or smoke on live camera",
            stepType: "video-verification",
            isMandatory: true,
            isConditional: false,
            expectedDurationMinutes: 1,
          },
          {
            stepNumber: 2,
            title: "Call Fire Department",
            description: "Dial emergency services immediately",
            stepType: "phone-call",
            isMandatory: true,
            isConditional: true,
            conditions: [
              {
                field: "step1Result",
                operator: "equals",
                value: "confirmed",
              },
            ],
            phoneCallDetails: {
              recipient: "Fire Department",
              phoneNumber: "911",
              requiresConfirmation: true,
            },
          },
          {
            stepNumber: 3,
            title: "Notify Branch Manager",
            description: "Notify branch manager of fire emergency",
            stepType: "notification",
            isMandatory: true,
            isConditional: false,
            notificationDetails: {
              recipients: ["branch-manager"],
              channels: ["sms", "voice"],
            },
          },
          {
            stepNumber: 4,
            title: "Activate Fire Protocol",
            description: "Trigger building evacuation and fire suppression",
            stepType: "external-escalation",
            isMandatory: true,
            isConditional: true,
            conditions: [
              {
                field: "step1Result",
                operator: "equals",
                value: "confirmed",
              },
            ],
          },
        ],
        escalationRules: [
          {
            triggerCondition: "no-acknowledgment",
            thresholdMinutes: 2,
            escalateTo: ["all-supervisors", "emergency-response-team"],
            notificationChannels: ["sms", "voice", "push"],
            message: "URGENT: Fire alert not acknowledged",
          },
        ],
      },

      // Camera Failure SOP
      {
        name: "Camera Failure Response",
        description: "Response procedure for camera offline and failures",
        incidentTypes: ["infrastructure-failure"],
        severityLevels: ["high", "medium"],
        slaMinutes: 30,
        steps: [
          {
            stepNumber: 1,
            title: "Verify Camera Status",
            description: "Check if camera is truly offline or experiencing network issues",
            stepType: "checklist",
            isMandatory: true,
            isConditional: false,
            checklistItems: [
              "Check live feed",
              "Check recording status",
              "Check network connectivity",
              "Check power supply",
            ],
          },
          {
            stepNumber: 2,
            title: "Attempt Remote Restart",
            description: "Try to restart camera remotely",
            stepType: "instruction",
            isMandatory: false,
            isConditional: false,
          },
          {
            stepNumber: 3,
            title: "Create Work Order",
            description: "Create maintenance work order for on-site inspection",
            stepType: "work-order",
            isMandatory: true,
            isConditional: true,
            conditions: [
              {
                field: "step2Result",
                operator: "equals",
                value: "failed",
              },
            ],
          },
          {
            stepNumber: 4,
            title: "Notify Branch",
            description: "Notify branch of camera outage",
            stepType: "notification",
            isMandatory: true,
            isConditional: false,
          },
        ],
        escalationRules: [
          {
            triggerCondition: "time-exceeded",
            thresholdMinutes: 60,
            escalateTo: ["maintenance-supervisor"],
            notificationChannels: ["email", "sms"],
            message: "Camera failure not resolved within 1 hour",
          },
        ],
      },
    ];
  }
}
