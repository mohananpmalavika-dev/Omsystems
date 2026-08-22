/**
 * Monitoring Worker
 * 
 * Asynchronously claims alert jobs from the Redis priority work queue,
 * verifies state against PostgreSQL, and coordinates routing and dispatch.
 */

import { redisMonitoringQueue, RedisMonitoringQueue } from "../queues/redis-monitoring-queue.js";
import { durableAlertRepository, DurableAlertRepository } from "../repositories/durable-alert.repository.js";
import { cmsRealtimeService, CmsRealtimeService } from "../services/cms-realtime.service.js";

export class MonitoringWorker {
  private isRunning = false;
  private timer?: NodeJS.Timeout | undefined;

  constructor(
    public readonly workerId: string = `worker-${Math.random().toString(36).slice(2, 8)}`,
    private readonly queue: RedisMonitoringQueue = redisMonitoringQueue,
    private readonly alerts: DurableAlertRepository = durableAlertRepository,
    private readonly realtime: CmsRealtimeService = cmsRealtimeService
  ) {}

  start(intervalMs = 100) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.processNext().catch((err) => {
        console.error(`[${this.workerId}] error processing queue item:`, err);
      });
    }, intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async processNext(): Promise<boolean> {
    const delivery = await this.queue.claimNext(this.workerId, 30);
    if (!delivery) return false;

    try {
      const alert = await this.alerts.findById(delivery.payload.alertId);
      if (!alert) {
        await delivery.deadLetter("Alert not found in PostgreSQL");
        return true;
      }

      // If alert is already resolved or closed, ack immediately
      if (["RESOLVED", "CLOSED"].includes(alert.status)) {
        await delivery.acknowledge();
        return true;
      }

      // Notify control-room operators
      await this.realtime.publishAlertChanged("ALERT_QUEUED", alert);
      await delivery.acknowledge();
      return true;
    } catch (err) {
      if (delivery.deliveryAttempt >= 5) {
        await delivery.deadLetter(err instanceof Error ? err.message : String(err));
      } else {
        await delivery.retry(Math.pow(2, delivery.deliveryAttempt));
      }
      return false;
    }
  }
}
