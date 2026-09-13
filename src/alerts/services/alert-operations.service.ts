import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import {
  ALLOWED_ALERT_TRANSITIONS,
  type AlertAuditEvent,
  type AlertComment,
  type AlertDisposition,
  type AlertResolution,
  type AlertSeverity,
  type AlertStatus,
  InvalidAlertTransitionError,
  type OperationalAlert,
} from "../domain/operational-alert.types.js";
import { AlertNormalizerService, type RawSourceEvent } from "./alert-normalizer.service.js";
import { AlertDeduplicationService } from "./alert-deduplication.service.js";
import { AlertEvidencePipelineService } from "./alert-evidence-pipeline.service.js";
import { pool as globalPool } from "../../database/pool.js";
import { TransactionalOutboxService } from "../../outbox/services/transactional-outbox.service.js";
import {
  type IOperationalAlertRepository,
  PostgresOperationalAlertRepository,
  MemoryOperationalAlertRepository,
  type AlertFilter,
} from "../repositories/postgres-operational-alert.repository.js";

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
  private readonly evidencePipeline: AlertEvidencePipelineService;
  private readonly outbox: TransactionalOutboxService;
  private repository: IOperationalAlertRepository;

  private readonly subscribers = new Set<(event: AlertRealtimeEvent) => void>();

  constructor(
    private pool?: Pool,
    evidencePipeline?: AlertEvidencePipelineService,
    outboxService?: TransactionalOutboxService,
    repository?: IOperationalAlertRepository,
  ) {
    this.pool = pool || globalPool || undefined;
    this.evidencePipeline = evidencePipeline ?? new AlertEvidencePipelineService();
    this.outbox = outboxService ?? new TransactionalOutboxService(this.pool);

    const isProduction = process.env.NODE_ENV === "production";
    if (repository) {
      this.repository = repository;
    } else if (this.pool) {
      this.repository = new PostgresOperationalAlertRepository(this.pool);
    } else if (isProduction) {
      throw new Error("ALERT_STORE_UNAVAILABLE: AlertOperationsService requires a PostgreSQL pool in production");
    } else {
      this.repository = new MemoryOperationalAlertRepository();
    }

    if (process.env.NODE_ENV !== "production" && !this.pool && this.repository instanceof MemoryOperationalAlertRepository) {
      this.seedDefaultAlerts();
    }
  }

  public setPool(databasePool: Pool): void {
    this.pool = databasePool;
    this.outbox.setPool(databasePool);
    this.repository = new PostgresOperationalAlertRepository(databasePool);
  }

  private getActivePool(): Pool | null {
    return this.pool || globalPool;
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

  async ingestEvent(
    rawEvent: RawSourceEvent,
    options?: { mockEvidenceFailure?: "RECORDER_OFFLINE" | "NO_RECORDING_FOUND" | "TIMEOUT" },
  ): Promise<OperationalAlert> {
    const candidate = this.normalizer.normalize(rawEvent);

    // 1. Pre-generate ID and Check Deduplication & Suppression Window
    const alertId = `alert-${randomUUID()}`;
    const dupCheck = await this.deduplication.checkDuplicate(
      candidate,
      (id) => this.repository.getAlert(id),
      alertId,
    );

    if (dupCheck.isDuplicate && dupCheck.existingAlert) {
      const existing = dupCheck.existingAlert;
      existing.occurrenceCount = dupCheck.dedupResult?.occurrenceCount ?? (existing.occurrenceCount + 1);
      existing.lastSeenAt = new Date(dupCheck.dedupResult?.lastSeenAt ?? Date.now());
      existing.revision += 1;

      const updated = await this.repository.updateAlert(existing);

      const activePool = this.getActivePool();
      if (activePool) {
        void this.outbox.writeOutboxEvent(activePool, {
          tenantId: existing.tenantId,
          aggregateType: "ALERT",
          aggregateId: existing.id,
          eventType: "ALERT_UPDATED",
          correlationId: existing.id,
          payload: {
            alertId: existing.id,
            occurrenceCount: existing.occurrenceCount,
            lastSeenAt: existing.lastSeenAt.toISOString(),
            revision: existing.revision,
          },
        }).catch(() => {});
      }

      await this.addAuditEvent(
        existing.id,
        existing.tenantId,
        "CREATED",
        undefined,
        "System Deduplication",
        { occurrenceCount: existing.occurrenceCount, dedupKey: candidate.dedupKey },
      );

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

      return updated;
    }

    // 2. Build Authoritative Operational Alert
    const now = candidate.occurredAt;
    const slaSecondsMap: Record<AlertSeverity, number> = {
      P1: 300,
      P2: 900,
      P3: 3600,
      P4: 86400,
    };
    const responseSlaSeconds = slaSecondsMap[candidate.severity] ?? 900;
    const responseDeadline = new Date(now.getTime() + responseSlaSeconds * 1000);
    const resolutionDeadline = new Date(now.getTime() + responseSlaSeconds * 10 * 1000);

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

    const savedAlert = await this.repository.createAlert(alert);

    const activePool = this.getActivePool();
    if (activePool) {
      void this.outbox.writeOutboxEvent(activePool, {
        tenantId: alert.tenantId,
        aggregateType: "ALERT",
        aggregateId: alert.id,
        eventType: "ALERT_CREATED",
        correlationId: alert.id,
        payload: {
          alertId: alert.id,
          tenantId: alert.tenantId,
          branchId: alert.branch.id,
          branchName: alert.branch.name,
          cameraId: alert.camera?.id,
          cameraName: alert.camera?.name,
          severity: alert.severity,
          detectionType: alert.detection.type,
          occurredAt: now.toISOString(),
        },
      }).catch(() => {});
    }

    await this.addAuditEvent(alertId, candidate.tenantId, "CREATED", undefined, "System Ingestion", {
      severity: alert.severity,
      type: alert.detection.type,
    });

    this.publish({
      type: "ALERT_CREATED",
      alertId,
      tenantId: alert.tenantId,
      revision: alert.revision,
      timestamp: now.toISOString(),
      payload: savedAlert,
    });

    // 3. Kick off Evidence Capture
    const capturePromise = this.evidencePipeline.initiateCapture(
      {
        alertId,
        tenantId: candidate.tenantId,
        branchId: candidate.branch.id,
        cameraId: candidate.camera?.id,
        occurredAt: now,
        mockFailure: options?.mockEvidenceFailure,
      },
      async (updatedEvidence) => {
        savedAlert.evidence = updatedEvidence;
        savedAlert.revision += 1;
        await this.repository.updateAlert(savedAlert);

        this.publish({
          type: "ALERT_EVIDENCE_UPDATED",
          alertId,
          tenantId: savedAlert.tenantId,
          revision: savedAlert.revision,
          timestamp: new Date().toISOString(),
          payload: { evidence: updatedEvidence, revision: savedAlert.revision },
        });
      },
    );

    if (options?.mockEvidenceFailure || process.env.NODE_ENV !== "production") {
      await capturePromise;
    }

    return savedAlert;
  }

  async acknowledgeAlert(
    alertId: string,
    actor: { id: string; name: string; tenantId?: string },
  ): Promise<OperationalAlert> {
    const alert = await this.repository.getAlert(alertId);
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

    const ack = {
      acknowledgedAt: now,
      acknowledgedBy: actor.id,
      acknowledgedByName: actor.name,
      responseTimeSeconds,
      slaBreached,
    };

    const updatedAlert = await this.repository.acknowledge(alertId, actor, ack);

    const activePool = this.getActivePool();
    if (activePool) {
      void this.outbox.writeOutboxEvent(activePool, {
        tenantId: alert.tenantId,
        aggregateType: "ALERT",
        aggregateId: alert.id,
        eventType: "ALERT_ACKNOWLEDGED",
        correlationId: alert.id,
        payload: {
          alertId: alert.id,
          status: "ACKNOWLEDGED",
          acknowledgedBy: actor.id,
          acknowledgedByName: actor.name,
          acknowledgedAt: now.toISOString(),
          responseTimeSeconds,
          slaBreached,
        },
      }).catch(() => {});
    }

    await this.addAuditEvent(alertId, alert.tenantId, "ACKNOWLEDGED", actor.id, actor.name, {
      responseTimeSeconds,
      slaBreached,
    });

    this.publish({
      type: "ALERT_ACKNOWLEDGED",
      alertId,
      tenantId: alert.tenantId,
      revision: updatedAlert.revision,
      timestamp: now.toISOString(),
      payload: {
        status: updatedAlert.status,
        acknowledgement: updatedAlert.acknowledgement,
        revision: updatedAlert.revision,
      },
    });

    return updatedAlert;
  }

  async escalateAlert(
    alertId: string,
    actor: { id: string; name: string },
    reason?: string,
  ): Promise<OperationalAlert> {
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    this.assertTransition(alert.status, "ESCALATED");

    const updatedAlert = await this.repository.escalate(alertId, actor, reason);

    const activePool = this.getActivePool();
    if (activePool) {
      void this.outbox.writeOutboxEvent(activePool, {
        tenantId: alert.tenantId,
        aggregateType: "ALERT",
        aggregateId: alert.id,
        eventType: "ALERT_ESCALATED",
        correlationId: alert.id,
        payload: {
          alertId: alert.id,
          status: "ESCALATED",
          escalatedBy: actor.id,
          escalatedByName: actor.name,
          escalationLevel: updatedAlert.escalationLevel,
          reason,
          escalatedAt: new Date().toISOString(),
        },
      }).catch(() => {});
    }

    await this.addAuditEvent(alertId, alert.tenantId, "ESCALATED", actor.id, actor.name, {
      reason,
      escalationLevel: updatedAlert.escalationLevel,
    });

    this.publish({
      type: "ALERT_ESCALATED",
      alertId,
      tenantId: alert.tenantId,
      revision: updatedAlert.revision,
      timestamp: new Date().toISOString(),
      payload: {
        status: updatedAlert.status,
        escalationLevel: updatedAlert.escalationLevel,
        revision: updatedAlert.revision,
      },
    });

    return updatedAlert;
  }

  async assignAlert(
    alertId: string,
    targetUser: { id: string; name: string },
    actor: { id: string; name: string },
  ): Promise<OperationalAlert> {
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    alert.assignment = {
      assignedTo: targetUser.id,
      assignedToName: targetUser.name,
      assignedAt: new Date(),
      assignedBy: actor.name,
    };
    alert.revision += 1;

    const updatedAlert = await this.repository.updateAlert(alert);

    await this.addAuditEvent(alertId, alert.tenantId, "ASSIGNED", actor.id, actor.name, {
      assignedTo: targetUser.name,
    });

    this.publish({
      type: "ALERT_UPDATED",
      alertId,
      tenantId: alert.tenantId,
      revision: updatedAlert.revision,
      timestamp: new Date().toISOString(),
      payload: { assignment: updatedAlert.assignment, revision: updatedAlert.revision },
    });

    return updatedAlert;
  }

  async resolveAlert(
    alertId: string,
    actor: { id: string; name: string },
    disposition: AlertDisposition,
    notes: string,
  ): Promise<OperationalAlert> {
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    if (!disposition) {
      throw new Error("Resolution requires a valid disposition code");
    }

    this.assertTransition(alert.status, "RESOLVED");

    const now = new Date();
    const resolutionTimeSeconds = Math.round((now.getTime() - alert.occurredAt.getTime()) / 1000);
    const slaBreached = now.getTime() > alert.resolutionDeadline.getTime();

    const resolution: AlertResolution = {
      resolvedAt: now,
      resolvedBy: actor.id,
      resolvedByName: actor.name,
      disposition,
      notes,
      resolutionTimeSeconds,
      slaBreached,
    };

    const updatedAlert = await this.repository.resolve(alertId, actor, resolution);

    const activePool = this.getActivePool();
    if (activePool) {
      void this.outbox.writeOutboxEvent(activePool, {
        tenantId: alert.tenantId,
        aggregateType: "ALERT",
        aggregateId: alert.id,
        eventType: "ALERT_RESOLVED",
        correlationId: alert.id,
        payload: {
          alertId: alert.id,
          status: "RESOLVED",
          disposition,
          notes,
          resolutionTimeSeconds,
          slaBreached,
        },
      }).catch(() => {});
    }

    await this.addAuditEvent(alertId, alert.tenantId, "RESOLVED", actor.id, actor.name, {
      disposition,
      notes,
      resolutionTimeSeconds,
      slaBreached,
    });

    this.publish({
      type: "ALERT_RESOLVED",
      alertId,
      tenantId: alert.tenantId,
      revision: updatedAlert.revision,
      timestamp: now.toISOString(),
      payload: {
        status: updatedAlert.status,
        resolution: updatedAlert.resolution,
        revision: updatedAlert.revision,
      },
    });

    return updatedAlert;
  }

  async addComment(
    alertId: string,
    actor: { id: string; name: string },
    commentText: string,
  ): Promise<AlertComment> {
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    const comment: AlertComment = {
      id: `comment-${Date.now()}`,
      alertId,
      authorId: actor.id,
      authorName: actor.name,
      comment: commentText,
      createdAt: new Date(),
    };

    const savedComment = await this.repository.addComment(alertId, comment);

    await this.addAuditEvent(alertId, alert.tenantId, "COMMENTED", actor.id, actor.name, {
      commentId: comment.id,
    });

    return savedComment;
  }

  async createLiveSession(alertId: string, _actorId: string): Promise<{
    sessionId: string;
    protocol: string;
    playbackUrl: string;
    expiresAt: Date;
  }> {
    const alert = await this.repository.getAlert(alertId);
    if (!alert) throw new Error(`Alert ${alertId} not found`);

    const sessionId = `live-session-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const playbackUrl = alert.camera?.id
      ? `/v1/media/live/${alert.camera.id}?session=${sessionId}`
      : `/v1/media/live/${alert.branch.id}?session=${sessionId}`;

    return {
      sessionId,
      protocol: "webrtc",
      playbackUrl,
      expiresAt,
    };
  }

  async getAlert(alertId: string): Promise<OperationalAlert | null> {
    return this.repository.getAlert(alertId);
  }

  async listAlerts(filter?: AlertFilter): Promise<OperationalAlert[]> {
    return this.repository.listAlerts(filter);
  }

  async getTimeline(alertId: string): Promise<AlertAuditEvent[]> {
    return this.repository.getTimeline(alertId);
  }

  async getComments(alertId: string): Promise<AlertComment[]> {
    return this.repository.getComments(alertId);
  }

  private assertTransition(current: AlertStatus, next: AlertStatus) {
    const allowed = ALLOWED_ALERT_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new InvalidAlertTransitionError(
        `Invalid alert transition from ${current} to ${next}. Allowed: [${allowed.join(", ")}]`,
      );
    }
  }

  private async addAuditEvent(
    alertId: string,
    tenantId: string,
    action: AlertAuditEvent["action"],
    actorId?: string,
    actorName?: string,
    metadata?: Record<string, unknown>,
  ) {
    const event: AlertAuditEvent = {
      id: `audit-${randomUUID()}`,
      alertId,
      tenantId,
      action,
      actorId,
      actorName,
      timestamp: new Date(),
      metadata,
    };
    await this.repository.appendAudit(event);
  }

  private seedDefaultAlerts() {
    const now = new Date();
    const seed1: OperationalAlert = {
      id: "alert-kochi-vault-01",
      tenantId: "00000000-0000-4000-8000-000000000001",
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
      occurredAt: new Date(now.getTime() - 45_000),
      responseDeadline: new Date(now.getTime() + 75_000),
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

    void this.repository.createAlert(seed1);
    void this.addAuditEvent(seed1.id, seed1.tenantId, "CREATED", undefined, "AI Detection Engine");
  }
}
