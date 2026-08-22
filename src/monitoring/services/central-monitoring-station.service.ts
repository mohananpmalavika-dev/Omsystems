/**
 * Central Monitoring Station Service (Stateless Coordinator)
 * 
 * Replaces previous in-memory eventQueue Map with a durable, horizontally scalable coordinator
 * backed by PostgreSQL (authoritative datastore) and Redis priority work queue.
 */

import type { NormalizedEvent } from "../../events/domain/normalized-event.types.js";
import { surveillanceEventRepository, SurveillanceEventRepository } from "../../events/repositories/surveillance-event.repository.js";
import { eventOutboxRepository, EventOutboxRepository } from "../../events/repositories/event-outbox.repository.js";
import type { DurableAlert, QueuedAlert } from "../domain/monitoring-queue.types.js";
import { durableAlertRepository, DurableAlertRepository } from "../repositories/durable-alert.repository.js";
import { redisMonitoringQueue, RedisMonitoringQueue } from "../queues/redis-monitoring-queue.js";
import { AlertPriorityService } from "./alert-priority.service.js";
import { cmsRealtimeService, CmsRealtimeService } from "./cms-realtime.service.js";
import { eventPipelineObservabilityService, EventPipelineObservabilityService } from "./event-pipeline-observability.service.js";

export class CentralMonitoringStationService {
  constructor(
    private readonly events: SurveillanceEventRepository = surveillanceEventRepository,
    private readonly alerts: DurableAlertRepository = durableAlertRepository,
    private readonly queue: RedisMonitoringQueue = redisMonitoringQueue,
    private readonly outbox: EventOutboxRepository = eventOutboxRepository,
    private readonly realtime: CmsRealtimeService = cmsRealtimeService,
    private readonly observability: EventPipelineObservabilityService = eventPipelineObservabilityService
  ) {}

  /**
   * Ingests a normalized surveillance event into the durable pipeline.
   */
  async ingestEvent(event: NormalizedEvent): Promise<{ alertId?: string | undefined; isDuplicate: boolean }> {
    const t0 = new Date(event.occurredAt).getTime();
    const t1 = Date.now();
    this.observability.recordIngested();

    // 1. Persist Event to PostgreSQL with Idempotency
    const { isDuplicate } = await this.events.persist(event);
    if (isDuplicate) {
      return { isDuplicate: true };
    }
    this.observability.recordPersisted();
    const t2 = Date.now();

    // 2. Filter & Generate Alert (P1, P2, P3 generate CMS work; P4 is durably logged)
    if (!["P1", "P2", "P3"].includes(event.severity)) {
      return { isDuplicate: false };
    }

    const alertId = `alert-${event.eventId}`;
    const detectedAt = new Date(event.occurredAt);
    const slaDueAt = event.severity === "P1"
      ? new Date(Date.now() + 60_000) // 1 min SLA for P1
      : event.severity === "P2"
      ? new Date(Date.now() + 300_000) // 5 min SLA for P2
      : new Date(Date.now() + 900_000);

    // 3. Persist Alert to PostgreSQL
    const alert = await this.alerts.create({
      id: alertId,
      eventId: event.eventId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      cameraId: event.cameraId,
      recorderId: event.recorderId,
      alertType: event.eventType,
      severity: event.severity,
      status: "QUEUED",
      title: event.title,
      description: event.description,
      detectedAt,
      escalationLevel: 0,
      slaDueAt,
    });
    const t3 = Date.now();

    // 4. Calculate Dynamic Work Queue Priority
    const priority = AlertPriorityService.calculatePriority(alert);

    // 5. Enqueue to Redis Priority Work Queue
    const queuedAlert: QueuedAlert = {
      alertId: alert.id,
      tenantId: alert.tenantId,
      branchId: alert.branchId,
      priority,
      createdAt: new Date().toISOString(),
    };
    await this.queue.enqueue(queuedAlert);
    const t4 = Date.now();

    // 6. Record Transactional Outbox for Distributed Subsystems
    await this.outbox.create({
      aggregateType: "ALERT",
      aggregateId: alert.id,
      eventType: "ALERT_QUEUED",
      payload: { alertId: alert.id, tenantId: alert.tenantId, priority },
      availableAt: new Date(),
    });

    // 7. Broadcast to Connected Operator WebSockets via Redis Pub/Sub
    await this.realtime.publishAlertChanged("ALERT_QUEUED", alert);
    const t5 = Date.now();

    // Record Latency Breakdown
    this.observability.recordLatency({
      eventId: event.eventId,
      occurredAt: t0,
      receivedAt: t1,
      persistedAt: t2,
      alertCreatedAt: t3,
      queuedAt: t4,
      deliveredToCMSAt: t5,
    });

    return { alertId: alert.id, isDuplicate: false };
  }

  async getActiveAlerts(tenantId = "bank-corp", operatorId?: string | undefined): Promise<DurableAlert[]> {
    return this.alerts.findActive(tenantId, operatorId);
  }

  async getAlertById(alertId: string): Promise<DurableAlert | undefined> {
    return this.alerts.findById(alertId);
  }

  async claimAlert(alertId: string, operatorId: string): Promise<DurableAlert | null> {
    const updated = await this.alerts.claimAlert(alertId, operatorId);
    if (updated) {
      await this.realtime.publishAlertChanged("ALERT_ASSIGNED", updated);
    }
    return updated;
  }

  async acknowledgeAlert(alertId: string, operatorId: string, expectedVersion?: number | undefined): Promise<DurableAlert | null> {
    const updated = await this.alerts.acknowledge(alertId, operatorId, expectedVersion);
    if (updated) {
      await this.realtime.publishAlertChanged("ALERT_ACKNOWLEDGED", updated);
    }
    return updated;
  }

  async getPipelineMetrics() {
    return this.observability.getMetrics();
  }

  async getDeadLetters() {
    return this.queue.getDeadLetterQueue();
  }
}

export const centralMonitoringStationService = new CentralMonitoringStationService();
