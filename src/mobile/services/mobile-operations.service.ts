import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  MobileHomePayload,
  MobileIncidentSummary,
  MobileBranchHealth,
  StructuredNoteType,
  MobileCommandResult,
  MobileOperatorInfo,
  MobilePredictedRisk,
  MobileLiveEvent,
} from "../domain/mobile-operations.types.js";
import { AlertOperationsService } from "../../alerts/services/alert-operations.service.js";
import type { ControlPlaneStore } from "../../control-plane-store.js";
import { branchHealthEvaluator } from "../../../backend/src/operational-health/services/branch-health-evaluator.service.js";

/**
 * Production Mobile Operations Service
 * 
 * Integrates with:
 * - AlertOperationsService for P1/P2 alerts
 * - ControlPlaneStore for incident management
 * - Branch health evaluator for fleet status
 * - Prediction services for risk forecasting
 */
export class MobileOperationsService {
  private alertService: AlertOperationsService;
  private liveEventsCache: MobileLiveEvent[] = [];
  private readonly MAX_LIVE_EVENTS = 50;

  constructor(
    private readonly store: ControlPlaneStore,
    private readonly pool?: Pool,
  ) {
    this.alertService = new AlertOperationsService(pool);
    this.initializeLiveEventListener();
  }

  /**
   * Subscribe to alert events to build live operations feed
   */
  private initializeLiveEventListener() {
    this.alertService.subscribe((event) => {
      const liveEvent: MobileLiveEvent = {
        id: randomUUID(),
        timestamp: event.timestamp,
        type: event.type,
        severity: event.payload.severity || "P3",
        branchId: event.payload.branch?.id,
        branchName: event.payload.branch?.name,
        cameraId: event.payload.camera?.id,
        cameraName: event.payload.camera?.name,
        message: this.formatLiveEventMessage(event),
      };

      this.liveEventsCache.unshift(liveEvent);
      if (this.liveEventsCache.length > this.MAX_LIVE_EVENTS) {
        this.liveEventsCache = this.liveEventsCache.slice(0, this.MAX_LIVE_EVENTS);
      }
    });
  }

  private formatLiveEventMessage(event: any): string {
    switch (event.type) {
      case "ALERT_CREATED":
        return `${event.payload.detection?.type || "Alert"} detected`;
      case "ALERT_ACKNOWLEDGED":
        return `Alert acknowledged`;
      case "ALERT_ESCALATED":
        return `Alert escalated to tier ${event.payload.escalationLevel}`;
      case "ALERT_RESOLVED":
        return `Alert resolved: ${event.payload.resolution?.disposition}`;
      case "ALERT_EVIDENCE_UPDATED":
        return `Evidence ${event.payload.evidence?.state}`;
      default:
        return event.type.replace(/_/g, " ").toLowerCase();
    }
  }

  /**
   * Get mobile home dashboard payload
   */
  async getMobileHome(
    tenantId: string,
    operatorUserId: string,
  ): Promise<MobileHomePayload> {
    // Get operator info and on-call status
    const operator = await this.getOperatorInfo(tenantId, operatorUserId);

    // Get critical alerts from alert service
    const allAlerts = Array.from((this.alertService as any).alerts.values());
    const p1Alerts = allAlerts.filter(
      (a: any) => a.tenantId === tenantId && a.severity === "P1" && a.status !== "RESOLVED"
    );
    const p2Alerts = allAlerts.filter(
      (a: any) => a.tenantId === tenantId && a.severity === "P2" && a.status !== "RESOLVED"
    );

    // Get incidents from store
    const incidents = await this.store.listIncidents(tenantId, {
      limit: 20,
      severity: "P1",
    });

    // Get assigned incidents
    const assignedIncidents = await this.store.listIncidents(tenantId, {
      assignedTo: operatorUserId,
      limit: 10,
    });

    // Build incident summaries
    const incidentSummaries: MobileIncidentSummary[] = [];

    // Convert P1 alerts to incident summaries
    for (const alert of p1Alerts.slice(0, 10)) {
      const summary = await this.alertToIncidentSummary(alert);
      if (summary) {
        incidentSummaries.push(summary);
      }
    }

    // Convert stored incidents
    for (const incident of incidents.slice(0, 5)) {
      const summary = await this.incidentToMobileSummary(incident);
      if (summary) {
        incidentSummaries.push(summary);
      }
    }

    // Sort by occurred time (most recent first)
    incidentSummaries.sort((a, b) => 
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

    // Get branch health summary
    const branchHealthSummary = await this.getBranchHealthSummary(tenantId);

    // Get predicted risks
    const predictedRisks = await this.getPredictedRisks(tenantId);

    // Get my assigned incidents count
    const myIncidentsCount = assignedIncidents.length;

    // Count unacknowledged
    const unacknowledgedCount = incidentSummaries.filter(
      (i) => !i.acknowledged
    ).length;

    return {
      criticalIncidentCount: p1Alerts.length + incidents.length,
      unacknowledgedCount,
      myIncidentsCount,
      operator,
      branchHealthSummary,
      incidents: incidentSummaries.slice(0, 10),
      predictedRisks,
      liveEvents: this.liveEventsCache.slice(0, 10),
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get operator information including on-call status
   */
  private async getOperatorInfo(
    tenantId: string,
    userId: string,
  ): Promise<MobileOperatorInfo> {
    // Get user from store
    const user = await this.store.getUser(userId);
    
    if (!user) {
      return {
        id: userId,
        name: "Operator",
        role: "SOC Operator",
        shift: "Active",
        onCall: false,
      };
    }

    // Determine shift based on current time (simplified)
    const hour = new Date().getHours();
    let shift = "Day Shift (08:00 - 16:00)";
    if (hour >= 16 && hour < 24) {
      shift = "Evening Shift (16:00 - 00:00)";
    } else if (hour >= 0 && hour < 8) {
      shift = "Night Shift (00:00 - 08:00)";
    }

    return {
      id: user.id,
      name: user.username,
      role: user.role || "SOC Operator",
      shift,
      onCall: true, // TODO: Integrate with actual on-call rotation service
    };
  }

  /**
   * Convert operational alert to mobile incident summary
   */
  private async alertToIncidentSummary(alert: any): Promise<MobileIncidentSummary | null> {
    if (!alert.branch) return null;

    const slaRemaining = this.calculateSLARemaining(
      alert.occurredAt,
      alert.responseDeadline,
    );

    return {
      id: alert.id,
      severity: alert.severity,
      type: alert.detection?.type || "UNKNOWN",
      title: this.generateIncidentTitle(alert),
      branch: {
        id: alert.branch.id,
        name: alert.branch.name,
        code: alert.branch.code || alert.branch.id,
        phone: alert.branch.phone || "+91XXXXXXXXXX",
        managerName: alert.branch.managerName,
      },
      camera: alert.camera
        ? {
            id: alert.camera.id,
            name: alert.camera.name,
            status: alert.camera.status || "ONLINE",
            recordingStatus: alert.camera.recordingStatus || "HEALTHY",
          }
        : undefined,
      occurredAt: alert.occurredAt.toISOString(),
      acknowledged: alert.status === "ACKNOWLEDGED" || alert.status === "ESCALATED" || alert.status === "RESOLVED",
      acknowledgedBy: alert.acknowledgement?.acknowledgedByName,
      acknowledgedAt: alert.acknowledgement?.acknowledgedAt?.toISOString(),
      assignedTo: alert.assignment?.assignedToName,
      assignedAt: alert.assignment?.assignedAt?.toISOString(),
      slaRemainingSeconds: Math.max(0, slaRemaining),
      slaBreached: slaRemaining < 0,
      snapshotUrl: alert.evidence?.snapshotUrl,
      clipUrl: alert.evidence?.clipUrl,
      clipDurationSeconds: alert.evidence?.clipDurationSeconds,
      availableActions: this.determineAvailableActions(alert),
      timeline: this.buildAlertTimeline(alert),
      aiConfidence: alert.detection?.confidence,
      aiDiagnosis: alert.detection?.diagnosis,
    };
  }

  /**
   * Convert stored incident to mobile summary
   */
  private async incidentToMobileSummary(incident: any): Promise<MobileIncidentSummary | null> {
    // Get branch details
    const branch = incident.branchId
      ? await this.store.getBranch(incident.branchId)
      : null;

    if (!branch) return null;

    const slaRemaining = this.calculateSLARemaining(
      new Date(incident.occurredAt),
      new Date(incident.occurredAt).getTime() + 120 * 60 * 1000, // 2 hour default SLA
    );

    return {
      id: incident.id,
      severity: incident.severity,
      type: incident.incidentType,
      title: incident.title,
      branch: {
        id: branch.id,
        name: branch.name,
        code: branch.code || branch.id,
        phone: branch.contactPhone || "+91XXXXXXXXXX",
        managerName: undefined,
      },
      occurredAt: incident.occurredAt,
      acknowledged: incident.status !== "new",
      assignedTo: incident.assignedTo,
      slaRemainingSeconds: Math.max(0, slaRemaining),
      slaBreached: slaRemaining < 0,
      availableActions: this.determineIncidentAvailableActions(incident),
      timeline: await this.buildIncidentTimeline(incident.id),
    };
  }

  private generateIncidentTitle(alert: any): string {
    const type = alert.detection?.type || "Alert";
    const severity = alert.severity;
    return `${severity} ${type.replace(/_/g, " ")}`;
  }

  private calculateSLARemaining(occurredAt: Date, deadline: Date | number): number {
    const deadlineTime = typeof deadline === "number" ? deadline : deadline.getTime();
    const remaining = Math.floor((deadlineTime - Date.now()) / 1000);
    return remaining;
  }

  private determineAvailableActions(alert: any): string[] {
    const actions: string[] = [];

    if (alert.status === "NEW") {
      actions.push("ACKNOWLEDGE");
    }

    if (alert.camera) {
      actions.push("LIVE_VIEW");
    }

    if (alert.evidence?.clipUrl) {
      actions.push("VIEW_CLIP");
    }

    if (alert.branch?.phone) {
      actions.push("CALL_BRANCH");
    }

    if (alert.status !== "RESOLVED") {
      actions.push("ESCALATE", "ASSIGN", "RESOLVE");
    }

    return actions;
  }

  private determineIncidentAvailableActions(incident: any): string[] {
    const actions: string[] = ["VIEW_DETAILS"];

    if (incident.status === "new") {
      actions.push("ACKNOWLEDGE");
    }

    if (incident.status !== "closed") {
      actions.push("ESCALATE", "ASSIGN", "CLOSE");
    }

    actions.push("CALL_BRANCH");

    return actions;
  }

  private buildAlertTimeline(alert: any): Array<{ timestamp: string; type: string; actor: string; message: string }> {
    const timeline: any[] = [];

    // Created event
    timeline.push({
      timestamp: alert.occurredAt.toISOString(),
      type: "ALERT_CREATED",
      actor: "AI Detection System",
      message: `${alert.detection?.type || "Alert"} detected with ${alert.detection?.confidence || 0}% confidence`,
    });

    // Acknowledgement
    if (alert.acknowledgement) {
      timeline.push({
        timestamp: alert.acknowledgement.acknowledgedAt.toISOString(),
        type: "ACKNOWLEDGED",
        actor: alert.acknowledgement.acknowledgedByName,
        message: `Alert acknowledged. Response time: ${alert.acknowledgement.responseTimeSeconds}s`,
      });
    }

    // Assignment
    if (alert.assignment) {
      timeline.push({
        timestamp: alert.assignment.assignedAt.toISOString(),
        type: "ASSIGNED",
        actor: alert.assignment.assignedBy,
        message: `Assigned to ${alert.assignment.assignedToName}`,
      });
    }

    // Escalation
    if (alert.status === "ESCALATED") {
      timeline.push({
        timestamp: new Date().toISOString(),
        type: "ESCALATED",
        actor: "System",
        message: `Escalated to tier ${alert.escalationLevel}`,
      });
    }

    // Resolution
    if (alert.resolution) {
      timeline.push({
        timestamp: alert.resolution.resolvedAt.toISOString(),
        type: "RESOLVED",
        actor: alert.resolution.resolvedByName,
        message: `Resolved as ${alert.resolution.disposition}. Notes: ${alert.resolution.notes}`,
      });
    }

    return timeline.reverse();
  }

  private async buildIncidentTimeline(incidentId: string): Promise<Array<{ timestamp: string; type: string; actor: string; message: string }>> {
    const events = await this.store.listIncidentEvents(incidentId);
    return events.map((e) => ({
      timestamp: e.timestamp,
      type: e.eventType,
      actor: e.performedBy || "System",
      message: e.description,
    }));
  }

  /**
   * Get branch health summary across fleet
   */
  private async getBranchHealthSummary(tenantId: string): Promise<{
    healthy: number;
    warning: number;
    critical: number;
    total: number;
  }> {
    const branches = await this.store.listBranches(tenantId, {});

    let healthy = 0;
    let warning = 0;
    let critical = 0;

    for (const branch of branches) {
      // Get branch health from health evaluator
      const health = (branch as any).healthState;
      
      if (health === "HEALTHY") {
        healthy++;
      } else if (health === "WARNING") {
        warning++;
      } else if (health === "CRITICAL") {
        critical++;
      } else {
        // UNKNOWN or null - count as warning
        warning++;
      }
    }

    return {
      healthy,
      warning,
      critical,
      total: branches.length,
    };
  }

  /**
   * Get predicted risks for mobile display
   */
  private async getPredictedRisks(tenantId: string): Promise<MobilePredictedRisk[]> {
    // TODO: Integrate with actual prediction service
    // For now, return empty array
    return [];
  }

  /**
   * Get incident by ID for mobile detail view
   */
  async getIncidentById(
    incidentId: string,
    tenantId: string,
  ): Promise<MobileIncidentSummary | null> {
    // Check if it's an alert
    const alert = (this.alertService as any).alerts.get(incidentId);
    if (alert && alert.tenantId === tenantId) {
      return this.alertToIncidentSummary(alert);
    }

    // Check stored incidents
    const incident = await this.store.getIncident(incidentId);
    if (incident && incident.tenantId === tenantId) {
      return this.incidentToMobileSummary(incident);
    }

    return null;
  }

  /**
   * Acknowledge alert/incident
   */
  async acknowledgeIncident(
    incidentId: string,
    tenantId: string,
    operator: { id: string; name: string },
    deviceId?: string,
  ): Promise<MobileCommandResult> {
    // Try alert first
    const alert = (this.alertService as any).alerts.get(incidentId);
    if (alert && alert.tenantId === tenantId) {
      try {
        await this.alertService.acknowledgeAlert(incidentId, operator);
        return {
          success: true,
          commandId: randomUUID(),
          incidentId,
          action: "ACKNOWLEDGE",
          operatorId: operator.id,
          timestamp: new Date().toISOString(),
          newStatus: "ACKNOWLEDGED",
          message: "Alert acknowledged successfully",
        };
      } catch (error: any) {
        return {
          success: false,
          commandId: randomUUID(),
          incidentId,
          action: "ACKNOWLEDGE",
          operatorId: operator.id,
          timestamp: new Date().toISOString(),
          message: error.message || "Failed to acknowledge alert",
        };
      }
    }

    // Try stored incident
    const incident = await this.store.getIncident(incidentId);
    if (incident && incident.tenantId === tenantId) {
      await this.store.updateIncidentStatus(
        incidentId,
        "acknowledged",
        operator.id,
        `Acknowledged from mobile device ${deviceId || "unknown"}`,
      );

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ACKNOWLEDGE",
        operatorId: operator.id,
        timestamp: new Date().toISOString(),
        newStatus: "acknowledged",
        message: "Incident acknowledged successfully",
      };
    }

    throw new Error("incident_not_found");
  }

  /**
   * Escalate alert/incident
   */
  async escalateIncident(
    incidentId: string,
    tenantId: string,
    operator: { id: string; name: string },
    reason: string,
    recipients?: string[],
  ): Promise<MobileCommandResult> {
    // Try alert first
    const alert = (this.alertService as any).alerts.get(incidentId);
    if (alert && alert.tenantId === tenantId) {
      await this.alertService.escalateAlert(incidentId, operator, reason);
      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ESCALATE",
        operatorId: operator.id,
        timestamp: new Date().toISOString(),
        newStatus: "ESCALATED",
        message: "Alert escalated successfully",
      };
    }

    // Try stored incident
    const incident = await this.store.getIncident(incidentId);
    if (incident && incident.tenantId === tenantId) {
      await this.store.escalateIncident(
        incidentId,
        operator.id,
        reason,
        recipients || [],
      );

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ESCALATE",
        operatorId: operator.id,
        timestamp: new Date().toISOString(),
        newStatus: "escalated",
        message: "Incident escalated successfully",
      };
    }

    throw new Error("incident_not_found");
  }

  /**
   * Assign alert/incident
   */
  async assignIncident(
    incidentId: string,
    tenantId: string,
    targetUserId: string,
    targetUserName: string,
    actor: { id: string; name: string },
  ): Promise<MobileCommandResult> {
    // Try alert first
    const alert = (this.alertService as any).alerts.get(incidentId);
    if (alert && alert.tenantId === tenantId) {
      await this.alertService.assignAlert(
        incidentId,
        { id: targetUserId, name: targetUserName },
        actor,
      );

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ASSIGN",
        operatorId: actor.id,
        timestamp: new Date().toISOString(),
        message: `Assigned to ${targetUserName}`,
      };
    }

    // Try stored incident
    const incident = await this.store.getIncident(incidentId);
    if (incident && incident.tenantId === tenantId) {
      await this.store.assignIncident(incidentId, targetUserId, actor.id);

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ASSIGN",
        operatorId: actor.id,
        timestamp: new Date().toISOString(),
        message: `Assigned to ${targetUserName}`,
      };
    }

    throw new Error("incident_not_found");
  }

  /**
   * Add structured note to incident timeline
   */
  async addIncidentNote(
    incidentId: string,
    tenantId: string,
    operator: { id: string; name: string },
    noteType: StructuredNoteType,
    customText?: string,
  ): Promise<MobileCommandResult> {
    const noteMessages: Record<StructuredNoteType, string> = {
      FALSE_ALARM: "Marked as false alarm - verified authorized activity",
      BRANCH_CONTACTED: `Branch manager contacted ${customText || ""}`.trim(),
      POLICE_CONTACTED: `Emergency services (112) notified ${customText || ""}`.trim(),
      SECURITY_DISPATCHED: `QRT security team dispatched ${customText || ""}`.trim(),
      MAINTENANCE_ACTIVITY: "Confirmed scheduled maintenance activity",
      PERSON_CONFIRMED: "Unauthorized person confirmed - escalating",
      CAMERA_FAILURE: "Camera hardware failure logged - work order created",
      CUSTOM_NOTE: customText || "Operator note added",
    };

    const message = noteMessages[noteType];

    // Try to add comment to alert
    const alert = (this.alertService as any).alerts.get(incidentId);
    if (alert && alert.tenantId === tenantId) {
      await this.alertService.addComment(incidentId, operator, message);

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ADD_NOTE",
        operatorId: operator.id,
        timestamp: new Date().toISOString(),
        message,
      };
    }

    // Try stored incident - add as event
    const incident = await this.store.getIncident(incidentId);
    if (incident && incident.tenantId === tenantId) {
      await this.store.addIncidentEvent({
        incidentId,
        eventType: `note_${noteType.toLowerCase()}`,
        description: message,
        details: { noteType, customText },
        performedBy: operator.id,
      });

      return {
        success: true,
        commandId: randomUUID(),
        incidentId,
        action: "ADD_NOTE",
        operatorId: operator.id,
        timestamp: new Date().toISOString(),
        message,
      };
    }

    throw new Error("incident_not_found");
  }

  /**
   * Initiate branch call (returns call info)
   */
  async initiateBranchCall(
    incidentId: string,
    tenantId: string,
    operator: { id: string; name: string },
  ): Promise<{ success: boolean; phone: string; managerName?: string; dialerUrl: string }> {
    const incident = await this.getIncidentById(incidentId, tenantId);
    if (!incident) {
      throw new Error("incident_not_found");
    }

    // Log the call initiation
    await this.addIncidentNote(
      incidentId,
      tenantId,
      operator,
      "BRANCH_CONTACTED",
      "Initiated mobile call to branch manager",
    );

    return {
      success: true,
      phone: incident.branch.phone,
      managerName: incident.branch.managerName,
      dialerUrl: `tel:${incident.branch.phone.replace(/[^0-9+]/g, "")}`,
    };
  }

  /**
   * Get detailed branch health for mobile view
   */
  async getBranchHealth(
    branchId: string,
    tenantId: string,
  ): Promise<MobileBranchHealth | null> {
    const branch = await this.store.getBranch(branchId);
    if (!branch || branch.tenantId !== tenantId) {
      return null;
    }

    // Get active incidents for this branch
    const incidents = await this.store.listIncidents(tenantId, {
      branchId,
      limit: 100,
    });

    const p1Count = incidents.filter(
      (i) => i.severity === "P1" && i.status !== "closed"
    ).length;
    const p2Count = incidents.filter(
      (i) => i.severity === "P2" && i.status !== "closed"
    ).length;

    // TODO: Get actual component health from telemetry
    return {
      branchId: branch.id,
      branchName: branch.name,
      branchCode: branch.code || branch.id,
      managerContact: {
        name: branch.contactName || "Branch Manager",
        phone: branch.contactPhone || "+91XXXXXXXXXX",
        role: "Branch Manager",
      },
      overallStatus: (branch as any).healthState || "HEALTHY",
      internet: {
        primary: "HEALTHY",
        backup5G: "STANDBY",
      },
      gateway: "HEALTHY",
      nvr: "HEALTHY",
      cameras: {
        online: 24, // TODO: Get from actual camera telemetry
        total: 24,
      },
      recording: {
        healthy: 24,
        total: 24,
      },
      storageUsedPct: 65.0,
      clockOffsetMs: 10,
      activeIncidents: {
        p1Count,
        p2Count,
      },
    };
  }

  /**
   * Create mobile live streaming session
   */
  async createMobileLiveSession(
    cameraId: string,
    tenantId: string,
    operator: { id: string },
  ): Promise<{
    sessionId: string;
    cameraId: string;
    protocol: string;
    streamResolution: string;
    bitrateKbps: number;
    fps: number;
    privacyMode: string;
    sessionUrl: string;
    expiresAt: string;
  }> {
    // TODO: Integrate with actual live streaming service
    return {
      sessionId: `mobile-${randomUUID().slice(0, 8)}`,
      cameraId,
      protocol: "WEBRTC",
      streamResolution: "720p_H264_SUBSTREAM",
      bitrateKbps: 700,
      fps: 15,
      privacyMode: "REDACTED_FACE_BLUR",
      sessionUrl: `/api/live?cameraId=${cameraId}&substream=true`,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  /**
   * Get live operations feed
   */
  getLiveEvents(limit: number = 10): MobileLiveEvent[] {
    return this.liveEventsCache.slice(0, limit);
  }
}
