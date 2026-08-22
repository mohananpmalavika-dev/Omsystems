/**
 * Notification Worker
 * 
 * Consumes pending notification jobs from the transactional outbox,
 * routes to appropriate channel providers, manages retry backoffs,
 * and maintains delivery audit state.
 */

import type {
  NotificationChannel,
  NotificationJob,
  ProviderHealth,
} from "../../domain/notification.types.js";
import { notificationOutbox, NotificationOutbox } from "../outbox/notification-outbox.js";
import { notificationProviderRegistry, NotificationProviderRegistry } from "../providers/notification-provider.interface.js";

export const CHANNEL_RETRY_POLICIES: Record<NotificationChannel, { maxAttempts: number; delaySeconds: number[] }> = {
  voice: {
    maxAttempts: 3,
    delaySeconds: [0, 60, 180],
  },
  sms: {
    maxAttempts: 3,
    delaySeconds: [0, 30, 120],
  },
  email: {
    maxAttempts: 4,
    delaySeconds: [0, 30, 120, 600],
  },
  dashboard: {
    maxAttempts: 1,
    delaySeconds: [0],
  },
  push: {
    maxAttempts: 2,
    delaySeconds: [0, 15],
  },
  system_log: {
    maxAttempts: 1,
    delaySeconds: [0],
  },
};

export class NotificationWorker {
  private isRunning = false;

  constructor(
    private readonly outbox: NotificationOutbox = notificationOutbox,
    private readonly providers: NotificationProviderRegistry = notificationProviderRegistry
  ) {}

  async processBatch(limit = 50): Promise<{ processed: number; succeeded: number; failed: number }> {
    const jobs = await this.outbox.claimPending(limit);
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      const ok = await this.processJob(job);
      if (ok) succeeded++;
      else failed++;
    }

    return {
      processed: jobs.length,
      succeeded,
      failed,
    };
  }

  async processJob(job: NotificationJob): Promise<boolean> {
    try {
      const provider = this.providers.get(job.channel);
      const result = await provider.send(job);

      await this.outbox.markSent(job.id, result);
      return true;
    } catch (err: unknown) {
      const policy = CHANNEL_RETRY_POLICIES[job.channel] || { maxAttempts: 3, delaySeconds: [0, 30, 60] };
      const nextDelaySec = policy.delaySeconds[job.attempts] ?? 60;
      const nextAttemptAt =
        job.attempts + 1 < job.maxAttempts ? new Date(Date.now() + nextDelaySec * 1000) : undefined;

      await this.outbox.markFailedOrRetry(job.id, err instanceof Error ? err : String(err), nextAttemptAt);
      return false;
    }
  }

  async checkAllProviderHealth(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    for (const provider of this.providers.getAll()) {
      if (provider.healthCheck) {
        try {
          const h = await provider.healthCheck();
          results.push(h);
        } catch (err: unknown) {
          results.push({
            provider: provider.channel,
            channel: provider.channel,
            status: "UNHEALTHY",
            latencyMs: 0,
            consecutiveFailures: 1,
            lastFailureAt: new Date(),
            lastError: err instanceof Error ? err.message : String(err),
            observedAt: new Date(),
          });
        }
      }
    }
    return results;
  }
}

export const notificationWorker = new NotificationWorker();
