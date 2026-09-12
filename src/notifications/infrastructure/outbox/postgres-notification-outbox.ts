/**
 * Durable PostgreSQL Notification Outbox Repository
 * 
 * Enforces:
 * - Persistent notification jobs across service crashes and restarts.
 * - Idempotency by idempotencyKey.
 * - Concurrency control using SELECT ... FOR UPDATE SKIP LOCKED.
 * - Audit recording of provider delivery attempts and dead letters.
 */

import type { Pool } from "pg";
import type {
  NotificationJob,
  NotificationStatus,
  ProviderSendResult,
} from "../../domain/notification.types.js";
import { DistributedStateUnavailableError } from "../../../errors/distributed-state.errors.js";

export class PostgresNotificationOutbox {
  private readonly memoryJobs = new Map<string, NotificationJob>();
  private readonly memoryIdempotency = new Map<string, string>();

  constructor(private readonly pool?: Pool) {}

  private isProduction(): boolean {
    return process.env.NODE_ENV === "production" && process.env.MEDIA_STATE_MODE !== "standalone";
  }

  async enqueue(
    job: Omit<NotificationJob, "id" | "createdAt" | "status" | "attempts">
  ): Promise<NotificationJob> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        // Idempotency check
        const existingRes = await client.query(
          `SELECT * FROM notification_jobs WHERE idempotency_key = $1`,
          [job.idempotencyKey]
        );
        if (existingRes.rows.length > 0) {
          await client.query("COMMIT");
          return this.mapRowToJob(existingRes.rows[0]);
        }

        const id = `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date();

        const insertRes = await client.query(
          `INSERT INTO notification_jobs (
            id, tenant_id, alert_id, incident_id, channel, priority,
            recipient_id, recipient_name, destination, payload, status,
            attempts, max_attempts, next_attempt_at, idempotency_key, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
          RETURNING *`,
          [
            id,
            job.tenantId,
            job.alertId,
            (job as any).incidentId || null,
            job.channel,
            job.priority,
            job.recipientId || null,
            job.recipientName || null,
            job.destination,
            JSON.stringify(job.payload),
            "PENDING",
            0,
            job.maxAttempts || 3,
            job.nextAttemptAt || null,
            job.idempotencyKey,
            now,
          ]
        );

        await client.query("COMMIT");
        return this.mapRowToJob(insertRes.rows[0]);
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (this.isProduction()) {
          throw new DistributedStateUnavailableError(`Failed to persist notification job: ${err.message}`);
        }
        throw err;
      } finally {
        client.release();
      }
    }

    // Fallback for non-production tests
    if (this.isProduction()) {
      throw new DistributedStateUnavailableError("PostgreSQL pool required for notification outbox in production");
    }

    const existingId = this.memoryIdempotency.get(job.idempotencyKey);
    if (existingId) {
      const existing = this.memoryJobs.get(existingId);
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
    this.memoryJobs.set(id, fullJob);
    this.memoryIdempotency.set(job.idempotencyKey, id);
    return fullJob;
  }

  async claimPending(limit = 50, now = new Date()): Promise<NotificationJob[]> {
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          `SELECT * FROM notification_jobs 
           WHERE status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
           ORDER BY created_at ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED`,
          [now, limit]
        );

        const claimed: NotificationJob[] = [];
        for (const row of res.rows) {
          await client.query(
            `UPDATE notification_jobs 
             SET status = 'PROCESSING', processing_started_at = $1, updated_at = $1 
             WHERE id = $2`,
            [now, row.id]
          );
          claimed.push({
            ...this.mapRowToJob(row),
            status: "PROCESSING",
            processingStartedAt: now,
          });
        }

        await client.query("COMMIT");
        return claimed;
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (this.isProduction()) {
          throw new DistributedStateUnavailableError(`Failed claiming pending notifications: ${err.message}`);
        }
        return [];
      } finally {
        client.release();
      }
    }

    const claimed: NotificationJob[] = [];
    for (const job of this.memoryJobs.values()) {
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
    const status: NotificationStatus = result.state === "DELIVERED" ? "DELIVERED" : "SENT";

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const res = await client.query(
          `UPDATE notification_jobs 
           SET status = $1, provider = $2, provider_message_id = $3, sent_at = $4,
               delivered_at = CASE WHEN $1 = 'DELIVERED' THEN $4 ELSE delivered_at END,
               attempts = attempts + 1, last_error = NULL, updated_at = $4
           WHERE id = $5
           RETURNING *`,
          [status, result.provider || null, result.providerMessageId || null, now, jobId]
        );

        if (res.rows.length === 0) {
          await client.query("ROLLBACK");
          return undefined;
        }

        // Record attempt audit
        await client.query(
          `INSERT INTO notification_attempts (job_id, attempt_number, provider, status, latency_ms, response_payload, created_at)
           VALUES ($1, $2, $3, 'SUCCESS', $4, $5, $6)`,
          [
            jobId,
            res.rows[0].attempts,
            result.provider || "unknown",
            null,
            result.metadata ? JSON.stringify(result.metadata) : null,
            now,
          ]
        );

        await client.query("COMMIT");
        return this.mapRowToJob(res.rows[0]);
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (this.isProduction()) {
          throw new DistributedStateUnavailableError(`Failed marking notification sent: ${err.message}`);
        }
        return undefined;
      } finally {
        client.release();
      }
    }

    const job = this.memoryJobs.get(jobId);
    if (!job) return undefined;
    job.status = status;
    job.provider = result.provider;
    job.providerMessageId = result.providerMessageId;
    job.sentAt = now;
    if (status === "DELIVERED") job.deliveredAt = now;
    job.attempts++;
    job.lastError = undefined;
    return job;
  }

  async markFailedOrRetry(
    jobId: string,
    error: Error | string,
    nextAttemptAt?: Date | undefined,
    provider = "unknown"
  ): Promise<NotificationJob | undefined> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const now = new Date();

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        const curRes = await client.query(`SELECT * FROM notification_jobs WHERE id = $1 FOR UPDATE`, [jobId]);
        if (curRes.rows.length === 0) {
          await client.query("ROLLBACK");
          return undefined;
        }

        const current = curRes.rows[0];
        const newAttempts = current.attempts + 1;
        const willRetry = Boolean(nextAttemptAt && newAttempts < current.max_attempts);
        const nextStatus: NotificationStatus = willRetry ? "PENDING" : "DEAD_LETTER";

        const updateRes = await client.query(
          `UPDATE notification_jobs
           SET status = $1, attempts = $2, next_attempt_at = $3, last_error = $4, updated_at = $5
           WHERE id = $6
           RETURNING *`,
          [nextStatus, newAttempts, willRetry ? nextAttemptAt : null, errorMsg, now, jobId]
        );

        // Record failed attempt
        await client.query(
          `INSERT INTO notification_attempts (job_id, attempt_number, provider, status, error_message, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [jobId, newAttempts, provider, willRetry ? "FAILURE_RETRYABLE" : "FAILURE_PERMANENT", errorMsg, now]
        );

        // If dead letter, record in dead letters table
        if (!willRetry) {
          await client.query(
            `INSERT INTO notification_dead_letters (job_id, tenant_id, reason, failed_at, payload)
             VALUES ($1, $2, $3, $4, $5)`,
            [jobId, current.tenant_id, errorMsg, now, current.payload]
          );
        }

        await client.query("COMMIT");
        return this.mapRowToJob(updateRes.rows[0]);
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (this.isProduction()) {
          throw new DistributedStateUnavailableError(`Failed updating notification failure state: ${err.message}`);
        }
        return undefined;
      } finally {
        client.release();
      }
    }

    const job = this.memoryJobs.get(jobId);
    if (!job) return undefined;
    job.attempts++;
    job.lastError = errorMsg;
    if (nextAttemptAt && job.attempts < job.maxAttempts) {
      job.status = "PENDING";
      job.nextAttemptAt = nextAttemptAt;
    } else {
      job.status = "DEAD_LETTER";
    }
    return job;
  }

  async markAcknowledgedByAlert(alertId: string, now = new Date()): Promise<number> {
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE notification_jobs 
         SET status = 'ACKNOWLEDGED', acknowledged_at = $1, updated_at = $1
         WHERE alert_id = $2 AND status IN ('SENT', 'DELIVERED', 'PROCESSING')`,
        [now, alertId]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    for (const job of this.memoryJobs.values()) {
      if (job.alertId === alertId && ["SENT", "DELIVERED", "PROCESSING"].includes(job.status)) {
        job.status = "ACKNOWLEDGED";
        job.acknowledgedAt = now;
        count++;
      }
    }
    return count;
  }

  async cancelPendingForAlert(alertId: string, reason = "CANCELLED_DUE_TO_ACKNOWLEDGEMENT", now = new Date()): Promise<number> {
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE notification_jobs
         SET status = 'CANCELLED', cancelled_at = $1, cancel_reason = $2, updated_at = $1
         WHERE alert_id = $3 AND status IN ('PENDING', 'PROCESSING')`,
        [now, reason, alertId]
      );
      return res.rowCount || 0;
    }

    let count = 0;
    for (const job of this.memoryJobs.values()) {
      if (job.alertId === alertId && ["PENDING", "PROCESSING"].includes(job.status)) {
        job.status = "CANCELLED";
        job.cancelledAt = now;
        job.cancelReason = reason;
        count++;
      }
    }
    return count;
  }

  async getJobsByAlert(alertId: string): Promise<NotificationJob[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM notification_jobs WHERE alert_id = $1 ORDER BY created_at ASC`,
        [alertId]
      );
      return res.rows.map((r) => this.mapRowToJob(r));
    }
    return Array.from(this.memoryJobs.values()).filter((j) => j.alertId === alertId);
  }

  async getDeadLetters(): Promise<NotificationJob[]> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT * FROM notification_jobs WHERE status = 'DEAD_LETTER' ORDER BY created_at DESC LIMIT 100`
      );
      return res.rows.map((r) => this.mapRowToJob(r));
    }
    return Array.from(this.memoryJobs.values()).filter((j) => j.status === "DEAD_LETTER");
  }

  async getJobById(id: string): Promise<NotificationJob | undefined> {
    if (this.pool) {
      const res = await this.pool.query(`SELECT * FROM notification_jobs WHERE id = $1`, [id]);
      if (res.rows.length === 0) return undefined;
      return this.mapRowToJob(res.rows[0]);
    }
    return this.memoryJobs.get(id);
  }

  clear() {
    this.memoryJobs.clear();
    this.memoryIdempotency.clear();
  }

  private mapRowToJob(row: any): NotificationJob {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      alertId: row.alert_id,
      channel: row.channel,
      priority: row.priority,
      recipientId: row.recipient_id || undefined,
      recipientName: row.recipient_name || undefined,
      destination: row.destination,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: row.next_attempt_at ? new Date(row.next_attempt_at) : undefined,
      provider: row.provider || undefined,
      providerMessageId: row.provider_message_id || undefined,
      idempotencyKey: row.idempotency_key,
      createdAt: new Date(row.created_at),
      processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at) : undefined,
      sentAt: row.sent_at ? new Date(row.sent_at) : undefined,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at) : undefined,
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : undefined,
      cancelReason: row.cancel_reason || undefined,
      lastError: row.last_error || undefined,
    };
  }
}
