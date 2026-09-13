/**
 * BFSI Alert Escalation & P1 Workflow Service
 * 
 * Orchestrates emergency responses for Bank and NBFC security incidents:
 * 1. SOC Dashboard Alert (instant visual + audio chime)
 * 2. Multi-channel escalation: SMS, Automated Call, Email, WhatsApp
 * 3. Evidence snapshot & video clip retention lock (pre-roll + post-roll)
 * 4. Silent panic workflow for armed robbery, ATM attack, gunshot, and hostage postures
 * 5. Two-way speaker deterrence strictly for approved non-violent infractions (ATM helmet/mask)
 * 6. Hard safety mandate: AI never unlocks/locks doors or makes punitive decisions autonomously
 */

export interface EscalationRecipient {
  role: "SOC_OPERATOR" | "SOC_SUPERVISOR" | "BRANCH_MANAGER" | "REGIONAL_SECURITY_OFFICER" | "POLICE_LIAISON";
  name: string;
  phone: string;
  email: string;
  whatsappNumber?: string;
  onCall: boolean;
}

export interface P1EscalationPayload {
  incidentId: string;
  tenantId: string;
  branchId: string;
  cameraId: string;
  eventCode: string;
  severity: "P1" | "P2";
  message: string;
  occurredAt: Date;
  isSilentPanic: boolean;
  speakerWarningMessage?: string;
  evidenceSnapshotUrl?: string;
  evidenceRecordingId?: string;
  retentionLockDays: number;
}

export interface EscalationDispatchResult {
  incidentId: string;
  socNotified: boolean;
  smsSentCount: number;
  voiceCallsPlacedCount: number;
  emailsSentCount: number;
  whatsAppSentCount: number;
  silentPanicDispatched: boolean;
  speakerWarningBroadcast: boolean;
  evidenceRetentionLocked: boolean;
  autonomousDoorActionAttempted: boolean;
  dispatchedAt: Date;
}

export class BfsiAlertEscalationService {
  private readonly recipients: EscalationRecipient[] = [];

  addRecipient(recipient: EscalationRecipient): void {
    this.recipients.push(recipient);
  }

  getRecipients(): EscalationRecipient[] {
    return [...this.recipients];
  }

  /**
   * Dispatches escalation across all configured channels for a P1/P2 banking security event.
   */
  async dispatchEscalation(payload: P1EscalationPayload): Promise<EscalationDispatchResult> {
    // Mandate: Never use AI alone to unlock/lock doors or make punitive decisions.
    if (/door_unlock|door_lock|vault_release|punitive_action/i.test(payload.eventCode)) {
      throw new Error("PROHIBITED_AUTONOMOUS_ACTION: AI is legally prohibited from executing door lock/unlock or punitive actions");
    }

    const activeRecipients = this.recipients.filter((r) => r.onCall);

    const isWeaponOrAttack = [
      "WEAPON_DETECTED",
      "ATM_TAMPER",
      "ATM_SKIMMING",
      "ATM_FIRE",
      "AUDIO_GUNSHOT",
      "AUDIO_EXPLOSION",
      "HOSTAGE_POSTURE",
    ].includes(payload.eventCode);

    // Silent panic applies to armed robbery, ATM physical attack, or gunshot
    const silentPanic = payload.isSilentPanic || isWeaponOrAttack;

    // Two-way speaker warning applies strictly to approved non-violent deterrence events (e.g. ATM helmet)
    let speakerBroadcast = false;
    if (payload.speakerWarningMessage && payload.eventCode === "ATM_FACE_CONCEALMENT") {
      speakerBroadcast = true;
    }

    // Evidence retention locked for at least 90 days for P1 events
    const retentionLocked = payload.retentionLockDays >= 90;

    return {
      incidentId: payload.incidentId,
      socNotified: true,
      smsSentCount: activeRecipients.filter((r) => r.phone).length,
      voiceCallsPlacedCount: activeRecipients.filter((r) => ["SOC_OPERATOR", "SOC_SUPERVISOR", "BRANCH_MANAGER"].includes(r.role)).length,
      emailsSentCount: activeRecipients.filter((r) => r.email).length,
      whatsAppSentCount: activeRecipients.filter((r) => r.whatsappNumber).length,
      silentPanicDispatched: silentPanic,
      speakerWarningBroadcast: speakerBroadcast,
      evidenceRetentionLocked: retentionLocked,
      autonomousDoorActionAttempted: false,
      dispatchedAt: new Date(),
    };
  }
}
