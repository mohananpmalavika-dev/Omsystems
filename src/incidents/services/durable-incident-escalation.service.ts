import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { RedisClientType } from "redis";

export interface EscalationJob {
  id: string;
  tenantId: string;
  incidentId: string;
  ruleId: string;
  triggerAt: Date;
  state: "PENDING" | "LOCKED" | "EXECUTED" | "CANCELLED" | "FAILED";
  retryCount: number;
  lockedBy?: string;
  lockedUntil?: Date;
  idempotencyKey: string;
  createdAt: Date;
  executedAt?: Date;
}

export type EscalationHandler = (job: EscalationJob) => Promise<void>;

export class DurableIncidentEscalationService {
  private isRunning = false;
  private pollTimer?: NodeJS.Timeout;
  private handler?: EscalationHandler;
  private readonly memoryJobs = new Map<string, EscalationJob>();

  constructor(
    private readonly pool?: Pool,
    private readonly redis?: RedisClientType | any,
    private readonly workerId = `worker-${process.pid}-${randomUUID().slice(0, 6)}`,
  ) {}

  setHandler(handler: EscalationHandler): void {
    this.handler = handler;
  }

  /**
   * Schedule a durable escalation job
   */
  async scheduleEscalation(
    tenantId: string,
    incidentId: string,
    ruleId: string,
    delayMs: number,
  ): Promise<EscalationJob> {
    const triggerAt = new Date(Date.now() + delayMs);
    const idempotencyKey = `${tenantId}:${incidentId}:${ruleId}`;
    const id = `esc-job-${randomUUID()}`;

    const job: EscalationJob = {
      id,
      tenantId,
      incidentId,
      ruleId,
      triggerAt,
      state: "PENDING",
      retryCount: 0,
      idempotencyKey,
      createdAt: new Date(),
    };

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `INSERT INTO incident_escalation_jobs (
             id, tenant_id, incident_id, rule_id, trigger_at, state, retry_count, idempotency_key, created_at
           ) VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6, NOW())
           ON CONFLICT (idempotency_key) DO UPDATE SET
             trigger_at = EXCLUDED.trigger_at,
             state = 'PENDING',
             executed_at = NULL
           RETURNING *`,
          [id, tenantId, incidentId, ruleId, triggerAt, idempotencyKey],
        );

        const row = res.rows[0];
        return {
          id: row.id,
          tenantId: row.tenant_id,
          incidentId: row.incident_id,
          ruleId: row.rule_id,
          triggerAt: new Date(row.trigger_at),
          state: row.state,
          retryCount: row.retry_count,
          idempotencyKey: row.idempotency_key,
          createdAt: new Date(row.created_at),
        };
      } catch (err) {
        console.warn("[DurableIncidentEscalation] DB schedule failed, using memory fallback:", err);
      }
    }

    this.memoryJobs.set(idempotencyKey, job);
    return job;
  }

  /**
   * Cancel an escalation job (e.g. when incident is acknowledged)
   */
  async cancelEscalation(tenantId: string, incidentId: string, ruleId: string): Promise<boolean> {
    const idempotencyKey = `${tenantId}:${incidentId}:${ruleId}`;

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `UPDATE incident_escalation_jobs SET state = 'CANCELLED' 
           WHERE idempotency_key = $1 AND state = 'PENDING'`,
          [idempotencyKey],
        );
        return (res.rowCount ?? 0) > 0;
      } catch (err) {
        console.warn("[DurableIncidentEscalation] DB cancel failed:", err);
      }
    }

    const existing = this.memoryJobs.get(idempotencyKey);
    if (existing && existing.state === "PENDING") {
      existing.state = "CANCELLED";
      return true;
    }
    return false;
  }

  /**
   * Start worker polling loop
   */
  start(pollIntervalMs = 5000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const tick = async () => {
      if (!this.isRunning) return;
      try {
        await this.processDueJobs();
      } catch (err) {
        console.error("[DurableIncidentEscalation] Poll tick error:", err);
      }
      if (this.isRunning) {
        this.pollTimer = setTimeout(tick, pollIntervalMs);
      }
    };

    this.pollTimer = setTimeout(tick, 100);
  }

  stop(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
  }

  /**
   * Lock and process due jobs atomically
   */
  async processDueJobs(): Promise<number> {
    let processedCount = 0;
    const now = new Date();

    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");

        // Lock due jobs atomically with SKIP LOCKED
        const lockRes = await client.query(
          `SELECT * FROM incident_escalation_jobs
           WHERE state = 'PENDING' AND trigger_at <= $1
           FOR UPDATE SKIP LOCKED
           LIMIT 10`,
          [now],
        );

        for (const row of lockRes.rows) {
          const job: EscalationJob = {
            id: row.id,
            tenantId: row.tenant_id,
            incidentId: row.incident_id,
            ruleId: row.rule_id,
            triggerAt: new Date(row.trigger_at),
            state: "LOCKED",
            retryCount: row.retry_count,
            idempotencyKey: row.idempotency_key,
            createdAt: new Date(row.created_at),
          };

          try {
            if (this.handler) {
              await this.handler(job);
            }

            await client.query(
              `UPDATE incident_escalation_jobs SET state = 'EXECUTED', executed_at = NOW() WHERE id = $1`,
              [job.id],
            );
            processedCount++;
          } catch (execErr) {
            console.error(`[DurableIncidentEscalation] Job ${job.id} execution failed:`, execErr);
            await client.query(
              `UPDATE incident_escalation_jobs SET state = 'FAILED', retry_count = retry_count + 1 WHERE id = $1`,
              [job.id],
            );
          }
        }

        await client.query("COMMIT");
        return processedCount;
      } catch (err) {
        await client.query("ROLLBACK");
        console.warn("[DurableIncidentEscalation] DB processDueJobs error:", err);
      } finally {
        client.release();
      }
    }

    // In-memory fallback
    for (const job of this.memoryJobs.values()) {
      if (job.state === "PENDING" && job.triggerAt <= now) {
        job.state = "LOCKED";
        try {
          if (this.handler) {
            await this.handler(job);
          }
          job.state = "EXECUTED";
          job.executedAt = new Date();
          processedCount++;
        } catch {
          job.state = "FAILED";
          job.retryCount++;
        }
      }
    }

    return processedCount;
  }
}
