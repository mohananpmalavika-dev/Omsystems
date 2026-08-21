import type { Pool } from "pg";
import {
  ALLOWED_ALERT_TRANSITIONS,
  type AlertAuditEvent,
  type AlertComment,
  type AlertDisposition,
  type AlertSeverity,
  type AlertStatus,
  InvalidAlertTransitionError,
  type OperationalAlert,
} from "../domain/operational-alert.types.js";
import {
  AlertNormalizerService,
  type RawSourceEvent,
} from "./alert-normalizer.service.js";
import { AlertDeduplicationService } from "./alert-deduplication.service.js";
import { AlertEvidencePipelineService } from "./alert-evidence-pipeline.service.js";

export interface AlertRealtimeEvent {
  type:
    | "ALERT_CREATED"
    | "ALERT_UPDATED"
    | "ALERT_EVIDENCE_UPDATED"
    | "ALERT_ACKNOWLEDGED"
    | "ALERT_ESCALATED"
    | "ALERT_RESOLVED";
  alertId: string;
  tenantId: string;
  revision: number;
  timestamp: string;
  payload: Partial<OperationalAlert>;
}

export class AlertOperationsService {
  private readonly normalizer = new AlertNormalizerService();
  private readonly deduplication = new AlertDeduplicationService();
  private readonly evidencePipeline = new AlertEvidencePipelineService();

  private readonly alerts = new Map<string, OperationalAlert>();
  private readonly auditEvents = new Map<string, AlertAuditEvent[]>();
  private readonly comments = new Map<string, AlertComment[]>();
  private readonly subscribers = new Set<(event: AlertRealtimeEvent) => void>();

  constructor(private readonly pool?: Pool) {
  }

  subscribe(listener: (event: AlertRealtimeEvent) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private publish(event: AlertRealtimeEvent) {
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch (err) {
        // Ignore subscriber errors
      }
    }
  }

  async ingestEvent(rawEvent: RawSourceEvent, options?: { mockEvidenceFailure?: "RECORDER_OFFLINE" | "NO_RECORDING_FOUND" | "TIMEOUT" }): Promise<OperationalAlert> {
    const candidate = this.normalizer.normalize(rawEvent);

    // 1. Check Deduplication & Suppression Window
    const dupCheck = this.deduplication.checkDuplicate(candidate, this.alerts);
    if (dupCheck.isDuplicate && dupCheck.existingAlert) {
      const existing = dupCheck.existingAlert;
      existing.occurrenceCount += 1;
      existing.lastSeenAt = new Date();
      existing.revision += 1;

      this.publish({
        type: "ALERT_UPDATED",
        alertId: existing.id,
        tenantId: existing.tenantId,
        revision: existing.revision,
        timestamp: new Date().toISOString(),
        payload: {
          occurrenceCount: existing.occurrenceCount,
          lastSeenAt: existing.lastSeenAt,
          revision: existing.revision,
        },
      });

      return existing;
    }

    // 2. Create New Alert Instance
    const now = candidate.occurredAt;
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // SLA calculation based on severity
    const responseMinutes = candidate.severity === "P1" ? 2 : candidate.severity === "P2" ? 5 : 15;
    const resolutionMinutes = candidate.severity === "P1" ? 15 : candidate.severity === "P2" ? 30 : 120;

    const responseDeadline = new Date(now.getTime() + responseMinutes * 60_000);
    const resolutionDeadline = new Date(now.getTime() + resolutionMinutes * 60_000);

    const alert: OperationalAlert = {
      id: alertId,
      tenantId: candidate.tenantId,
      revision: 1,
      branch: candidate.branch,
      camera: candidate.camera,
      detection: candidate.detection,
      severity: candidate.severity,
      status: "NEW",
      occurredAt: now,
      responseDeadline,
      resolutionDeadline,
      evidence: {
        state: "QUEUED",
        snapshotState: "QUEUED",
        clipState: "QUEUED",
        preEventSeconds: 15,
        postEventSeconds: 30,
      },
      escalationLevel: 1,
      occurrenceCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      dedupKey: candidate.dedupKey,
    };

    this.alerts.set(alertId, alert);
    this.deduplication.registerWindow(alert);

    this.addAuditEvent(alertId, candidate.tenantId, "CREATED", undefined, "System Ingestion", {
      severity: alert.severity,
      type: alert.detection.type,
    });

    this.publish({
      type: "ALERT_CREATED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: now.toISOString(),
      payload: alert,
    });

    // 3. Kick off Asynchronous Evidence Capture (Non-Blocking)
    void this.evidencePipeline.initiateCapture(
      {
        alertId,
        tenantId: candidate.tenantId,
        branchId: candidate.branch.id,
        cameraId: candidate.camera?.id,
        occurredAt: now,
        mockFailure: options?.mockEvidenceFailure,
      },
      (updatedEvidence) => {
        alert.evidence = updatedEvidence;
        alert.revision += 1;

        this.publish({
          type: "ALERT_EVIDENCE_UPDATED",
          alertId,
          tenantId: alert.tenantId,
          revision: alert.revision,
          timestamp: new Date().toISOString(),
          payload: { evidence: updatedEvidence, revision: alert.revision },
        });
      },
    );

    return alert;
  }

  async acknowledgeAlert(
    alertId: string,
    actor: { id: string; name: string; tenantId?: string },
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    if (alert.status !== "NEW") {
      throw new InvalidAlertTransitionError(
        `Alert already handled: current status is ${alert.status} (acknowledged by ${alert.acknowledgement?.acknowledgedByName ?? "another operator"})`,
      );
    }

    this.assertTransition(alert.status, "ACKNOWLEDGED");

    const now = new Date();
    const responseTimeSeconds = Math.round((now.getTime() - alert.occurredAt.getTime()) / 1000);
    const slaBreached = now.getTime() > alert.responseDeadline.getTime();

    alert.status = "ACKNOWLEDGED";
    alert.revision += 1;
    alert.acknowledgement = {
      acknowledgedAt: now,
      acknowledgedBy: actor.id,
      acknowledgedByName: actor.name,
      responseTimeSeconds,
      slaBreached,
    };

    this.addAuditEvent(alertId, alert.tenantId, "ACKNOWLEDGED", actor.id, actor.name, {
      responseTimeSeconds,
      slaBreached,
    });

    this.publish({
      type: "ALERT_ACKNOWLEDGED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: now.toISOString(),
      payload: {
        status: alert.status,
        acknowledgement: alert.acknowledgement,
        revision: alert.revision,
      },
    });

    return alert;
  }

  async escalateAlert(
    alertId: string,
    actor: { id: string; name: string },
    reason?: string,
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    this.assertTransition(alert.status, "ESCALATED");

    alert.status = "ESCALATED";
    alert.escalationLevel += 1;
    alert.revision += 1;

    this.addAuditEvent(alertId, alert.tenantId, "ESCALATED", actor.id, actor.name, {
      escalationLevel: alert.escalationLevel,
      reason,
    });

    if (reason) {
      await this.addComment(alertId, actor, `[Escalation Note Tier ${alert.escalationLevel}]: ${reason}`);
    }

    this.publish({
      type: "ALERT_ESCALATED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: new Date().toISOString(),
      payload: {
        status: alert.status,
        escalationLevel: alert.escalationLevel,
        revision: alert.revision,
      },
    });

    return alert;
  }

  async assignAlert(
    alertId: string,
    targetUser: { id: string; name: string },
    actor: { id: string; name: string },
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    alert.assignment = {
      assignedTo: targetUser.id,
      assignedToName: targetUser.name,
      assignedAt: new Date(),
      assignedBy: actor.name,
    };
    alert.revision += 1;

    this.addAuditEvent(alertId, alert.tenantId, "ASSIGNED", actor.id, actor.name, {
      assignedTo: targetUser.name,
    });

    this.publish({
      type: "ALERT_UPDATED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: new Date().toISOString(),
      payload: { assignment: alert.assignment, revision: alert.revision },
    });

    return alert;
  }

  async resolveAlert(
    alertId: string,
    actor: { id: string; name: string },
    disposition: AlertDisposition,
    notes: string,
  ): Promise<OperationalAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    if (!disposition) {
      throw new Error("Resolution requires a valid disposition code");
    }

    this.assertTransition(alert.status, "RESOLVED");

    const now = new Date();
    const resolutionTimeSeconds = Math.round((now.getTime() - alert.occurredAt.getTime()) / 1000);
    const slaBreached = now.getTime() > alert.resolutionDeadline.getTime();

    alert.status = "RESOLVED";
    alert.revision += 1;
    alert.resolution = {
      resolvedAt: now,
      resolvedBy: actor.id,
      resolvedByName: actor.name,
      disposition,
      notes,
      resolutionTimeSeconds,
      slaBreached,
    };

    this.addAuditEvent(alertId, alert.tenantId, "RESOLVED", actor.id, actor.name, {
      disposition,
      notes,
      resolutionTimeSeconds,
      slaBreached,
    });

    this.publish({
      type: "ALERT_RESOLVED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: now.toISOString(),
      payload: {
        status: alert.status,
        resolution: alert.resolution,
        revision: alert.revision,
      },
    });

    return alert;
  }

  async addComment(
    alertId: string,
    actor: { id: string; name: string },
    commentText: string,
  ): Promise<AlertComment> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    const comment: AlertComment = {
      id: `comment-${Date.now()}`,
      alertId,
      authorId: actor.id,
      authorName: actor.name,
      comment: commentText,
      createdAt: new Date(),
    };

    const list = this.comments.get(alertId) || [];
    list.push(comment);
    this.comments.set(alertId, list);

    this.addAuditEvent(alertId, alert.tenantId, "COMMENTED", actor.id, actor.name, {
      commentId: comment.id,
    });

    return comment;
  }

  async createLiveSession(alertId: string, actorId: string): Promise<{
    sessionId: string;
    protocol: string;
    playbackUrl: string;
    expiresAt: Date;
  }> {
    const alert = this.alerts.get(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    const sessionId = `live-session-${alertId}-${Date.now()}`;
    const expiresAt = new Date(Date.now() + 15 * 60_000); // 15 mins
    const playbackUrl = `/media/live/streams/${alert.camera?.id ?? "cam-01"}.webrtc`;

    alert.evidence.liveStreamSessionId = sessionId;
    alert.evidence.liveStreamPlaybackUrl = playbackUrl;

    this.addAuditEvent(alertId, alert.tenantId, "EVIDENCE_VIEWED", actorId, "Operator", {
      session: "LIVE_WEBRTC",
    });

    return {
      sessionId,
      protocol: "webrtc",
      playbackUrl,
      expiresAt,
    };
  }

  async getAlert(alertId: string): Promise<OperationalAlert | null> {
    return this.alerts.get(alertId) ?? null;
  }

  async listAlerts(filter?: {
    severity?: AlertSeverity | undefined;
    status?: AlertStatus | undefined;
    branchId?: string | undefined;
    slaBreached?: boolean | undefined;
  }): Promise<OperationalAlert[]> {
    let list = Array.from(this.alerts.values()).sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    );

    if (filter?.severity) {
      list = list.filter((a) => a.severity === filter.severity);
    }
    if (filter?.status) {
      list = list.filter((a) => a.status === filter.status);
    }
    if (filter?.branchId) {
      list = list.filter((a) => a.branch.id === filter.branchId);
    }
    if (filter?.slaBreached) {
      const now = Date.now();
      list = list.filter((a) => a.status === "NEW" && a.responseDeadline.getTime() < now);
    }

    return list;
  }

  async getTimeline(alertId: string): Promise<AlertAuditEvent[]> {
    return this.auditEvents.get(alertId) ?? [];
  }

  async getComments(alertId: string): Promise<AlertComment[]> {
    return this.comments.get(alertId) ?? [];
  }

  private assertTransition(current: AlertStatus, next: AlertStatus) {
    const allowed = ALLOWED_ALERT_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new InvalidAlertTransitionError(
        `Invalid alert transition from ${current} to ${next}. Allowed: [${allowed.join(", ")}]`,
      );
    }
  }

  private addAuditEvent(
    alertId: string,
    tenantId: string,
    action: AlertAuditEvent["action"],
    actorId?: string,
    actorName?: string,
    metadata?: Record<string, unknown>,
  ) {
    const event: AlertAuditEvent = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      alertId,
      tenantId,
      action,
      actorId,
      actorName,
      timestamp: new Date(),
      metadata,
    };
    const list = this.auditEvents.get(alertId) || [];
    list.push(event);
    this.auditEvents.set(alertId, list);
  }

  private seedDefaultAlerts() {
    const now = new Date();
    const seed1: OperationalAlert = {
      id: "alert-kochi-vault-01",
      tenantId: "tenant-bank-01",
      revision: 1,
      branch: { id: "branch-041", name: "Kochi Main", zone: "Strongroom Vault" },
      camera: { id: "cam-04", name: "Vault CAM 04", channel: 4, criticality: "CRITICAL" },
      detection: {
        type: "person_in_vault",
        category: "AI",
        title: "Restricted Area Vault Intrusion",
        description: "Unauthorized human presence detected in strongroom outside banking hours.",
        confidence: 0.964,
        boundingBoxes: [{ x: 120, y: 80, width: 240, height: 400, label: "Person" }],
      },
      severity: "P1",
      status: "NEW",
      occurredAt: new Date(now.getTime() - 45_000), // 45s ago
      responseDeadline: new Date(now.getTime() + 75_000), // 75s remaining
      resolutionDeadline: new Date(now.getTime() + 14 * 60_000),
      evidence: {
        state: "READY",
        snapshotState: "READY",
        clipState: "READY",
        snapshotUrl: "/media/snapshots/alert-kochi-vault-01.jpg",
        clipUrl: "/media/clips/alert-kochi-vault-01.mp4",
        clipDurationSeconds: 45,
        preEventSeconds: 15,
        postEventSeconds: 30,
      },
      escalationLevel: 1,
      occurrenceCount: 3,
      firstSeenAt: new Date(now.getTime() - 45_000),
      lastSeenAt: now,
      dedupKey: "tenant-bank-01:branch-041:cam-04:person_in_vault",
    };

    this.alerts.set(seed1.id, seed1);
    this.addAuditEvent(seed1.id, seed1.tenantId, "CREATED", undefined, "AI Detection Engine");
  }
}
