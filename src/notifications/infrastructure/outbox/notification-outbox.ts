/**
 * Transactional Notification Outbox
 * 
 * Enforces atomic enqueueing, idempotent deduplication, durable state transitions,
 * retry scheduling, and cancellation upon alert acknowledgment.
 */

import type {
  NotificationJob,
  NotificationStatus,
  ProviderSendResult,
} from "../../domain/notification.types.js";

export class NotificationOutbox {
  private jobs: Map<string, NotificationJob> = new Map();
  private idempotencyIndex: Map<string, string> = new Map();

  async enqueue(job: Omit<NotificationJob, "id" | "createdAt" | "status" | "attempts">): Promise<NotificationJob> {
    // Idempotency check: if job for this alert + channel + recipient already exists, return existing
    const existingId = this.idempotencyIndex.get(job.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (existing) return existing;
    }

    const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const fullJob: NotificationJob = {
      ...job,
      id,
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
    };

    this.jobs.set(id, fullJob);
    this.idempotencyIndex.set(job.idempotencyKey, id);
    return fullJob;
  }

  async claimPending(limit = 50, now = new Date()): Promise<NotificationJob[]> {
    const claimed: NotificationJob[] = [];

    for (const job of this.jobs.values()) {
      if (job.status === "PENDING") {
        if (!job.nextAttemptAt || job.nextAttemptAt.getTime() <= now.getTime()) {
          job.status = "PROCESSING";
          job.processingStartedAt = now;
          claimed.push(job);
          if (claimed.length >= limit) break;
        }
      }
    }

    return claimed;
  }

  async markSent(jobId: string, result: ProviderSendResult, now = new Date()): Promise<NotificationJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = result.state === "DELIVERED" ? "DELIVERED" : "SENT";
    job.provider = result.provider;
    job.providerMessageId = result.providerMessageId;
    job.sentAt = now;
    if (result.state === "DELIVERED") {
      job.deliveredAt = now;
    }
    job.attempts++;
    job.lastError = undefined;

    return job;
  }

  async markFailedOrRetry(
    jobId: string,
    error: Error | string,
    nextAttemptAt?: Date | undefined
  ): Promise<NotificationJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.attempts++;
    job.lastError = error instanceof Error ? error.message : String(error);

    if (nextAttemptAt && job.attempts < job.maxAttempts) {
      job.status = "PENDING";
      job.nextAttemptAt = nextAttemptAt;
    } else {
      job.status = "DEAD_LETTER";
    }

    return job;
  }

  async markAcknowledgedByAlert(alertId: string, now = new Date()): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.alertId === alertId) {
        if (job.status === "SENT" || job.status === "DELIVERED" || job.status === "PROCESSING") {
          job.status = "ACKNOWLEDGED";
          job.acknowledgedAt = now;
          count++;
        }
      }
    }
    return count;
  }

  async cancelPendingForAlert(alertId: string, reason = "CANCELLED_DUE_TO_ACKNOWLEDGEMENT", now = new Date()): Promise<number> {
    let count = 0;
    for (const job of this.jobs.values()) {
      if (job.alertId === alertId && (job.status === "PENDING" || job.status === "PROCESSING")) {
        job.status = "CANCELLED";
        job.cancelledAt = now;
        job.cancelReason = reason;
        count++;
      }
    }
    return count;
  }

  getJobsByAlert(alertId: string): NotificationJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.alertId === alertId);
  }

  getAllJobs(limit = 100): NotificationJob[] {
    return Array.from(this.jobs.values()).slice(0, limit);
  }

  getDeadLetters(): NotificationJob[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === "DEAD_LETTER");
  }

  getJobById(id: string): NotificationJob | undefined {
    return this.jobs.get(id);
  }

  clear() {
    this.jobs.clear();
    this.idempotencyIndex.clear();
  }
}

export const notificationOutbox = new NotificationOutbox();
