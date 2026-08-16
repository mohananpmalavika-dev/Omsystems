import type { PlaybookDefinition } from "../domain/playbook.types.js";

export class PlaybookDefinitionRepository {
  private readonly playbooks = new Map<string, PlaybookDefinition>();

  constructor() {
    this.seedDefaultPlaybooks();
  }

  private seedDefaultPlaybooks(): void {
    // 1. P1 Vault Intrusion Playbook (9-Step Enterprise Banking SOP)
    const vaultIntrusionP1: PlaybookDefinition = {
      id: "vault-intrusion-p1",
      name: "P1 Vault Intrusion & Breach Response",
      version: 1,
      description: "Mandatory standard operating procedure for vault intrusion alarms, sensor breaches, or unauthorized human detection after hours.",
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
          description: "Open live stream for the vault primary and secondary cameras. Verify if human presence, flashlights, or physical tampering is occurring.",
          mandatory: true,
          evidenceRequirements: {
            requireLiveVerification: true,
          },
          estimatedDurationSeconds: 30,
        },
        {
          id: "step-2-review-evidence",
          order: 2,
          type: "EVIDENCE_REVIEW",
          title: "Review -15s / +30s Event Evidence",
          description: "Inspect pre-alarm and post-alarm evidence clip and snapshot to identify motion triggers and ingress point.",
          mandatory: true,
          evidenceRequirements: {
            videoBeforeSeconds: 15,
            videoAfterSeconds: 30,
            snapshotRequired: true,
          },
          estimatedDurationSeconds: 45,
          dependsOn: ["step-1-live-verification"],
        },
        {
          id: "step-3-branch-status",
          order: 3,
          type: "AUTOMATED_CHECK",
          title: "Verify Branch Operational Status",
          description: "System automatically checks branch business hours, holiday calendar, and current open/closed status.",
          mandatory: true,
          automatedAction: {
            service: "branchOperations",
            method: "getOpeningStatus",
          },
        },
        {
          id: "step-4-access-control",
          order: 4,
          type: "AUTOMATED_CHECK",
          title: "Query Access Control & Door Sensors",
          description: "System queries biometric and RFID access logs for authorized employee badge entries in the last 15 minutes.",
          mandatory: true,
          automatedAction: {
            service: "accessControl",
            method: "getRecentDoorEvents",
          },
        },
        {
          id: "step-5-call-manager",
          order: 5,
          type: "EXTERNAL_CALL",
          title: "Call Branch Manager / Key Holder",
          description: "Initiate emergency contact call to the registered branch manager or vault keyholder to confirm if scheduled maintenance or authorized entry is underway.",
          mandatory: true,
          escalationTimeoutSeconds: 60,
          dependsOn: ["step-2-review-evidence"],
        },
        {
          id: "step-6-notify-security",
          order: 6,
          type: "NOTIFICATION",
          title: "Notify Regional Security Control Room",
          description: "Send priority push notification and SMS alert to Regional Security Officer and Head of Security.",
          mandatory: true,
        },
        {
          id: "step-7-decision-classification",
          order: 7,
          type: "DECISION",
          title: "Record Operator Classification & Threat Level",
          description: "Select structured incident classification based on verified camera footage and branch manager response.",
          mandatory: true,
          decisionOutputs: [
            {
              choice: "CONFIRMED_INTRUSION",
              label: "🚨 Confirmed Intrusion (Robbery / Breach)",
              nextStepId: "step-8-dispatch-qrt",
              requireNotes: true,
              requireEvidenceId: true,
            },
            {
              choice: "AUTHORIZED_ACTIVITY",
              label: "✅ Authorized Keyholder / Approved Overtime",
              nextStepId: "step-9-resolution-gate",
              requireNotes: true,
            },
            {
              choice: "FALSE_POSITIVE",
              label: "⚠️ False Alarm (Spider / Light Reflection / Sensor Flap)",
              nextStepId: "step-9-resolution-gate",
              requireNotes: true,
            },
          ],
        },
        {
          id: "step-8-dispatch-qrt",
          order: 8,
          type: "ESCALATION",
          title: "Dispatch Emergency Quick Response Team (QRT) & Police",
          description: "Dispatch armed local QRT and transmit automated police PCR van dispatch packet with GPS coordinates and live camera link.",
          mandatory: false, // Only triggered if confirmed intrusion
        },
        {
          id: "step-9-resolution-gate",
          order: 9,
          type: "RESOLUTION_GATE",
          title: "Incident Resolution Gate",
          description: "Final verification ensuring all mandatory actions, evidence recordings, and manager notifications are satisfied before resolution.",
          mandatory: true,
        },
      ],
    };

    // 2. P1 Panic Alarm Playbook
    const panicAlarmP1: PlaybookDefinition = {
      id: "panic-alarm-p1",
      name: "P1 Panic Button & Robbery Response",
      version: 1,
      description: "Immediate emergency procedure triggered by teller counter panic switch, cashier wireless panic fob, or ATM booth duress code.",
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
          title: "Verify Live Teller & Banking Hall Cameras",
          description: "Open live audio/video wall for cashier desk and banking hall.",
          mandatory: true,
        },
        {
          id: "step-2-virtual-guard-talkdown",
          order: 2,
          type: "OPERATOR_ACTION",
          title: "Activate Two-Way Virtual Guard Talkdown",
          description: "Broadcast live audio warning over branch IP horn speakers if active hostility is confirmed.",
          mandatory: true,
        },
        {
          id: "step-3-police-qrt-dispatch",
          order: 3,
          type: "ESCALATION",
          title: "Dispatch Local Police & Mobile QRT",
          description: "Trigger immediate dialer to nearest police station and armed response team.",
          mandatory: true,
        },
        {
          id: "step-4-panic-resolution-gate",
          order: 4,
          type: "RESOLUTION_GATE",
          title: "Resolution Gate",
          description: "Verify police report number and all safety clearances prior to closing incident.",
          mandatory: true,
        },
      ],
    };

    // 3. P2 Cash Counter Unauthorized Presence Playbook
    const cashCounterP2: PlaybookDefinition = {
      id: "cash-counter-p2",
      name: "P2 Cash Counter Perimeter Breach",
      version: 1,
      description: "Triggered when AI detects unauthorized person crossing cash cabin counter perimeter or tampering with cashier partition.",
      category: "banking_security",
      trigger: {
        incidentType: "CASH_COUNTER_INTRUSION",
        severity: "P2",
      },
      resolutionPolicy: {
        requireMandatorySteps: true,
        allowOverride: false,
        overridePermission: "incident.resolve.override",
        requireClassification: true,
        requireRootCause: false,
      },
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-08-16T00:00:00Z",
      steps: [
        {
          id: "step-1-check-teller-camera",
          order: 1,
          type: "LIVE_VIDEO_REVIEW",
          title: "Check Cash Counter Camera",
          description: "Verify if customer reached over counter or if authorized cashier is present.",
          mandatory: true,
        },
        {
          id: "step-2-teller-evidence",
          order: 2,
          type: "EVIDENCE_REVIEW",
          title: "Review 30-Second Snapshot Clip",
          description: "Check snapshot showing hand/body crossing virtual boundary line.",
          mandatory: true,
        },
        {
          id: "step-3-teller-classification",
          order: 3,
          type: "DECISION",
          title: "Classify Cash Counter Event",
          description: "Select whether event was customer accidental reach or intentional attempt.",
          mandatory: true,
        },
      ],
    };

    this.playbooks.set(vaultIntrusionP1.id, vaultIntrusionP1);
    this.playbooks.set(panicAlarmP1.id, panicAlarmP1);
    this.playbooks.set(cashCounterP2.id, cashCounterP2);
  }

  async getById(playbookId: string): Promise<PlaybookDefinition | null> {
    return this.playbooks.get(playbookId) || null;
  }

  async findByTrigger(
    incidentType: string,
    severity?: string,
  ): Promise<PlaybookDefinition | null> {
    const formattedType = incidentType.toUpperCase().replace(/[-\s]/g, "_");

    for (const playbook of this.playbooks.values()) {
      if (playbook.status !== "ACTIVE") continue;
      if (playbook.trigger.incidentType === formattedType) {
        if (!playbook.trigger.severity || playbook.trigger.severity === severity) {
          return playbook;
        }
      }
    }

    // Default fallback to vault intrusion if high severity
    if (severity === "P1") {
      return this.playbooks.get("vault-intrusion-p1") || null;
    }
    return this.playbooks.get("cash-counter-p2") || null;
  }

  async listAll(): Promise<PlaybookDefinition[]> {
    return Array.from(this.playbooks.values());
  }

  async registerPlaybook(playbook: PlaybookDefinition): Promise<void> {
    this.playbooks.set(playbook.id, playbook);
  }
}
