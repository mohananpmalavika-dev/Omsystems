/**
 * Monitoring Reconciliation Worker
 * 
 * Safety-net worker that periodically reclaims abandoned queue messages
 * from crashed workers and reconciles active PostgreSQL alerts missing from Redis.
 */

import { redisMonitoringQueue, RedisMonitoringQueue } from "../queues/redis-monitoring-queue.js";
import { durableAlertRepository, DurableAlertRepository } from "../repositories/durable-alert.repository.js";
import { AlertPriorityService } from "../services/alert-priority.service.js";

export class MonitoringReconciliationWorker {
  private timer?: NodeJS.Timeout | undefined;

  constructor(
    private readonly queue: RedisMonitoringQueue = redisMonitoringQueue,
    private readonly alerts: DurableAlertRepository = durableAlertRepository
  ) {}

  start(intervalMs = 5000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.reconcile().catch((err) => {
        console.error("Reconciliation error:", err);
      });
    }, intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async reconcile(): Promise<{ reclaimedMessages: number; recoveredAlerts: number }> {
    // 1. Reclaim abandoned messages from crashed workers
    const reclaimedMessages = await this.queue.reclaimExpired(30);

    // 2. Scan PostgreSQL for active un-acknowledged alerts and ensure presence in Redis
    const unqueuedAlerts = await this.alerts.findUnqueuedActive();
    let recoveredAlerts = 0;

    for (const alert of unqueuedAlerts) {
      const priority = AlertPriorityService.calculatePriority(alert);
      await this.queue.enqueue({
        alertId: alert.id,
        tenantId: alert.tenantId,
        branchId: alert.branchId,
        priority,
        createdAt: alert.createdAt.toISOString(),
      });
      recoveredAlerts++;
    }

    return { reclaimedMessages, recoveredAlerts };
  }
}

export const monitoringReconciliationWorker = new MonitoringReconciliationWorker();
