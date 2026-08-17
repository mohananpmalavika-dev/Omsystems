import { randomUUID } from "node:crypto";
import type {
  MobileHomePayload,
  MobileIncidentSummary,
  MobileBranchHealth,
  StructuredNoteType,
  MobileCommandResult,
} from "../domain/mobile-operations.types.js";

export class MobileOperationsService {
  private incidents = new Map<string, MobileIncidentSummary>();
  private branchHealths = new Map<string, MobileBranchHealth>();

  constructor() {
    this.seedMockData();
  }

  private seedMockData() {
    const now = new Date();

    // 1. Seed Active P1 Critical Mobile Incidents
    const inc1: MobileIncidentSummary = {
      id: "INC-20260817-1182",
      severity: "P1",
      type: "VAULT_INTRUSION",
      title: "P1 Vault Motion & Perimeter Breach",
      branch: {
        id: "BR-118",
        name: "Ernakulam South Hub",
        code: "EKM-118",
        phone: "+914842345678",
        managerName: "Mr. Suresh Kumar (Branch Manager)",
      },
      camera: {
        id: "CAM-17",
        name: "Vault Entrance Main (CAM-17)",
        status: "ONLINE",
        recordingStatus: "HEALTHY",
      },
      occurredAt: new Date(now.getTime() - 42 * 1000).toISOString(),
      acknowledged: false,
      slaRemainingSeconds: 78,
      snapshotUrl: "/assets/sample_vault_snapshot.jpg",
      clipUrl: "/media/clips/INC-20260817-1182.mp4",
      clipDurationSeconds: 45,
      availableActions: ["ACKNOWLEDGE", "LIVE_VIEW", "VIEW_CLIP", "CALL_BRANCH", "ESCALATE"],
      timeline: [
        {
          timestamp: new Date(now.getTime() - 42 * 1000).toISOString(),
          type: "INTRUSION_DETECTED",
          actor: "AI Detector (Human Motion Core)",
          message: "Human motion verified inside restricted Vault zone during armed after-hours window.",
        },
        {
          timestamp: new Date(now.getTime() - 40 * 1000).toISOString(),
          type: "SNAPSHOT_SEALED",
          actor: "Evidence Subsystem",
          message: "Cryptographic SHA-256 evidence snapshot captured and sealed.",
        },
        {
          timestamp: new Date(now.getTime() - 38 * 1000).toISOString(),
          type: "MOBILE_PUSH_DISPATCHED",
          actor: "Notification Engine",
          message: "High-priority push notification dispatched to on-call Regional Operators.",
        },
      ],
    };
    this.incidents.set(inc1.id, inc1);

    const inc2: MobileIncidentSummary = {
      id: "INC-20260817-2041",
      severity: "P1",
      type: "RECORDER_OFFLINE",
      title: "P1 Primary NVR Offline",
      branch: {
        id: "BR-204",
        name: "Trivandrum City Branch",
        code: "TVM-204",
        phone: "+914712456789",
        managerName: "Ms. Lakshmi Menon (Ops Head)",
      },
      camera: {
        id: "CAM-01",
        name: "Branch Banking Hall Main",
        status: "ONLINE",
        recordingStatus: "FAILED",
      },
      occurredAt: new Date(now.getTime() - 120 * 1000).toISOString(),
      acknowledged: false,
      slaRemainingSeconds: 0,
      snapshotUrl: "/assets/sample_vault_snapshot.jpg",
      availableActions: ["ACKNOWLEDGE", "LIVE_VIEW", "CALL_BRANCH", "ESCALATE"],
      timeline: [
        {
          timestamp: new Date(now.getTime() - 120 * 1000).toISOString(),
          type: "HEARTBEAT_TIMEOUT",
          actor: "Health Monitor",
          message: "NVR lost heartbeat connectivity with Central Cloud.",
        },
      ],
    };
    this.incidents.set(inc2.id, inc2);

    // 2. Seed Compact Branch Health
    const bh1: MobileBranchHealth = {
      branchId: "BR-118",
      branchName: "Ernakulam South Hub",
      branchCode: "EKM-118",
      managerContact: {
        name: "Mr. Suresh Kumar",
        phone: "+914842345678",
        role: "Branch Manager",
      },
      overallStatus: "CRITICAL",
      internet: {
        primary: "HEALTHY",
        backup5G: "HEALTHY",
      },
      gateway: "HEALTHY",
      nvr: "HEALTHY",
      cameras: {
        online: 23,
        total: 24,
      },
      recording: {
        healthy: 23,
        total: 24,
      },
      storageUsedPct: 71.4,
      clockOffsetMs: 14,
      activeIncidents: {
        p1Count: 1,
        p2Count: 0,
      },
    };
    this.branchHealths.set(bh1.branchId, bh1);
  }

  getMobileHome(operator = { id: "USR-42", name: "Rajesh Kumar", role: "SOC Regional Operator", shift: "Night Shift (22:00 - 06:00)", onCall: true }): MobileHomePayload {
    const list = [...this.incidents.values()];
    const p1List = list.filter((i) => i.severity === "P1");
    const unack = list.filter((i) => !i.acknowledged);

    return {
      criticalIncidentCount: p1List.length,
      unacknowledgedCount: unack.length,
      operator,
      branchHealthSummary: {
        healthy: 374,
        warning: 18,
        critical: 8,
        total: 400,
      },
      incidents: list,
    };
  }

  getIncidentById(incidentId: string): MobileIncidentSummary | undefined {
    return this.incidents.get(incidentId);
  }

  acknowledgeIncident(
    incidentId: string,
    operator = { id: "USR-42", name: "Rajesh Kumar" },
    deviceId = "mobile-pwa-client",
  ): MobileCommandResult {
    const inc = this.incidents.get(incidentId);
    if (!inc) throw new Error("incident_not_found");

    if (inc.acknowledged) {
      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ACKNOWLEDGE",
        operatorId: inc.acknowledgedBy || operator.id,
        timestamp: inc.acknowledgedAt || new Date().toISOString(),
        message: `Incident was already acknowledged by ${inc.acknowledgedBy || operator.name}.`,
      };
    }

    const now = new Date().toISOString();
    inc.acknowledged = true;
    inc.acknowledgedBy = `${operator.name} (${operator.id})`;
    inc.acknowledgedAt = now;

    inc.timeline.unshift({
      timestamp: now,
      type: "OPERATOR_ACKNOWLEDGED",
      actor: `${operator.name} (Mobile PWA)`,
      message: `Incident acknowledged from device ${deviceId}. SLA timer stopped.`,
    });

    return {
      success: true,
      commandId: randomUUID(),
      incidentId,
      action: "ACKNOWLEDGE",
      operatorId: operator.id,
      timestamp: now,
      newStatus: "ACKNOWLEDGED",
      message: "Incident successfully acknowledged.",
    };
  }

  initiateBranchCall(
    incidentId: string,
    operator = { id: "USR-42", name: "Rajesh Kumar" },
  ): { success: boolean; phone: string; managerName: string; dialerUrl: string } {
    const inc = this.incidents.get(incidentId);
    if (!inc) throw new Error("incident_not_found");

    const now = new Date().toISOString();
    inc.timeline.unshift({
      timestamp: now,
      type: "CALL_INITIATED",
      actor: `${operator.name} (Mobile PWA)`,
      message: `Direct call initiated to Branch Manager ${inc.branch.managerName || inc.branch.name} (${inc.branch.phone}).`,
    });

    return {
      success: true,
      phone: inc.branch.phone,
      managerName: inc.branch.managerName || inc.branch.name,
      dialerUrl: `tel:${inc.branch.phone.replace(/[^0-9+]/g, "")}`,
    };
  }

  addIncidentNote(
    incidentId: string,
    operator = { id: "USR-42", name: "Rajesh Kumar" },
    noteType: StructuredNoteType,
    customText?: string,
  ): MobileCommandResult {
    const inc = this.incidents.get(incidentId);
    if (!inc) throw new Error("incident_not_found");

    const now = new Date().toISOString();
    let noteText = "";

    switch (noteType) {
      case "FALSE_ALARM":
        noteText = "Marked as FALSE ALARM. Verified regular authorized staff entry.";
        break;
      case "BRANCH_CONTACTED":
        noteText = `Branch manager contacted. Confirmed on-site security check in progress. ${customText || ""}`;
        break;
      case "POLICE_CONTACTED":
        noteText = `Emergency Police (112) notified. Local patrol unit dispatched. ${customText || ""}`;
        break;
      case "SECURITY_DISPATCHED":
        noteText = `Quick Response Team (QRT) field guards dispatched to branch premises. ${customText || ""}`;
        break;
      case "PERSON_CONFIRMED":
        noteText = `Unauthorized person confirmed inside vault perimeter. Escalation triggered. ${customText || ""}`;
        break;
      case "MAINTENANCE_ACTIVITY":
        noteText = `Authorized scheduled maintenance verified with IT Operations. ${customText || ""}`;
        break;
      case "CAMERA_FAILURE":
        noteText = `Hardware camera feed failure logged. Work-order generated. ${customText || ""}`;
        break;
      case "CUSTOM_NOTE":
      default:
        noteText = customText || "Operator note added.";
        break;
    }

    inc.timeline.unshift({
      timestamp: now,
      type: `NOTE_${noteType}`,
      actor: `${operator.name} (Mobile PWA)`,
      message: noteText,
    });

    return {
      success: true,
      commandId: randomUUID(),
      incidentId,
      action: "ADD_NOTE",
      operatorId: operator.id,
      timestamp: now,
      message: noteText,
    };
  }

  escalateIncident(
    incidentId: string,
    operator = { id: "USR-42", name: "Rajesh Kumar" },
    reason = "Critical vault breach unconfirmed by branch staff.",
  ): MobileCommandResult {
    const inc = this.incidents.get(incidentId);
    if (!inc) throw new Error("incident_not_found");

    const now = new Date().toISOString();
    inc.timeline.unshift({
      timestamp: now,
      type: "INCIDENT_ESCALATED",
      actor: `${operator.name} (Mobile PWA)`,
      message: `Incident escalated to Regional Security Manager & National Head Office SOC. Reason: ${reason}`,
    });

    return {
      success: true,
      commandId: randomUUID(),
      incidentId,
      action: "ESCALATE",
      operatorId: operator.id,
      timestamp: now,
      newStatus: "ESCALATED_REGIONAL_HEAD",
      message: "Incident successfully escalated to Regional Security Manager.",
    };
  }

  getBranchHealth(branchId: string): MobileBranchHealth {
    const existing = this.branchHealths.get(branchId);
    if (existing) return existing;

    return {
      branchId,
      branchName: `Branch ${branchId}`,
      branchCode: branchId,
      managerContact: {
        name: "Branch Ops Manager",
        phone: "+919876543210",
        role: "Branch Manager",
      },
      overallStatus: "HEALTHY",
      internet: { primary: "HEALTHY", backup5G: "HEALTHY" },
      gateway: "HEALTHY",
      nvr: "HEALTHY",
      cameras: { online: 24, total: 24 },
      recording: { healthy: 24, total: 24 },
      storageUsedPct: 65.0,
      clockOffsetMs: 8,
      activeIncidents: { p1Count: 0, p2Count: 0 },
    };
  }

  createMobileLiveSession(cameraId: string, operator = { id: "USR-42" }) {
    return {
      sessionId: `ms-mob-${randomUUID().slice(0, 8)}`,
      cameraId,
      protocol: "WEBRTC",
      streamResolution: "720p_H264_SUBSTREAM",
      bitrateKbps: 700,
      fps: 15,
      privacyMode: "REDACTED_FACE_BLUR",
      sessionUrl: `/api/live?channel=1&substream=true`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }
}
