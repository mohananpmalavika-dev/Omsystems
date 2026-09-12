/**
 * Transactional Notification Outbox
 * 
 * Enforces atomic enqueueing, idempotent deduplication, durable state transitions,
 * retry scheduling, and cancellation upon alert acknowledgment.
 * Backed by PostgresNotificationOutbox for database durability.
 */

import type { Pool } from "pg";
import type {
  NotificationJob,
  ProviderSendResult,
} from "../../domain/notification.types.js";
import { PostgresNotificationOutbox } from "./postgres-notification-outbox.js";

export class NotificationOutbox {
  private delegate: PostgresNotificationOutbox;

  constructor(pool?: Pool) {
    this.delegate = new PostgresNotificationOutbox(pool);
  }

  setPool(pool: Pool) {
    this.delegate = new PostgresNotificationOutbox(pool);
  }

  async enqueue(job: Omit<NotificationJob, "id" | "createdAt" | "status" | "attempts">): Promise<NotificationJob> {
    return this.delegate.enqueue(job);
  }

  async claimPending(limit = 50, now = new Date()): Promise<NotificationJob[]> {
    return this.delegate.claimPending(limit, now);
  }

  async markSent(jobId: string, result: ProviderSendResult, now = new Date()): Promise<NotificationJob | undefined> {
    return this.delegate.markSent(jobId, result, now);
  }

  async markFailedOrRetry(
    jobId: string,
    error: Error | string,
    nextAttemptAt?: Date | undefined
  ): Promise<NotificationJob | undefined> {
    return this.delegate.markFailedOrRetry(jobId, error, nextAttemptAt);
  }

  async markAcknowledgedByAlert(alertId: string, now = new Date()): Promise<number> {
    return this.delegate.markAcknowledgedByAlert(alertId, now);
  }

  async cancelPendingForAlert(alertId: string, reason = "CANCELLED_DUE_TO_ACKNOWLEDGEMENT", now = new Date()): Promise<number> {
    return this.delegate.cancelPendingForAlert(alertId, reason, now);
  }

  async getJobsByAlert(alertId: string): Promise<NotificationJob[]> {
    return this.delegate.getJobsByAlert(alertId);
  }

  async getAllJobs(limit = 100): Promise<NotificationJob[]> {
    return this.delegate.getJobsByAlert(""); // Or implement getAll
  }

  async getDeadLetters(): Promise<NotificationJob[]> {
    return this.delegate.getDeadLetters();
  }

  async getJobById(id: string): Promise<NotificationJob | undefined> {
    return this.delegate.getJobById(id);
  }

  clear() {
    this.delegate.clear();
  }
}

export const notificationOutbox = new NotificationOutbox();
