import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export type ReplenishmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface EdgeReplenishmentJob {
  id: string;
  tenantId: string;
  cameraId: string;
  gapStart: Date;
  gapEnd: Date;
  status: ReplenishmentStatus;
  bytesTransferred: number;
  totalBytes: number;
  throttleKbps: number;
  errorMessage?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueReplenishmentInput {
  tenantId: string;
  cameraId: string;
  gapStart: Date;
  gapEnd: Date;
  throttleKbps?: number;
  totalBytesEstimate?: number;
}

export class EdgeReplenishmentService {
  private inMemoryJobs = new Map<string, EdgeReplenishmentJob>();

  constructor(private readonly pool?: Pool) {}

  /**
   * Enqueues an edge trickle backfill job for a detected recording gap
   */
  async queueJob(input: QueueReplenishmentInput): Promise<EdgeReplenishmentJob> {
    const id = randomUUID();
    const throttleKbps = input.throttleKbps || 500;
    const totalBytes = input.totalBytesEstimate || 104857600; // 100MB default estimate
    const now = new Date();

    if (this.pool) {
      const res = await this.pool.query(
        `INSERT INTO edge_replenishment_jobs
         (id, tenant_id, camera_id, gap_start, gap_end, status, bytes_transferred, total_bytes, throttle_kbps, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', 0, $6, $7, $8, $8)
         RETURNING *`,
        [id, input.tenantId, input.cameraId, input.gapStart, input.gapEnd, totalBytes, throttleKbps, now]
      );
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        cameraId: row.camera_id,
        gapStart: new Date(row.gap_start),
        gapEnd: new Date(row.gap_end),
        status: row.status as ReplenishmentStatus,
        bytesTransferred: Number(row.bytes_transferred),
        totalBytes: Number(row.total_bytes),
        throttleKbps: Number(row.throttle_kbps),
        errorMessage: row.error_message,
        retryCount: Number(row.retry_count),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    }

    const job: EdgeReplenishmentJob = {
      id,
      tenantId: input.tenantId,
      cameraId: input.cameraId,
      gapStart: input.gapStart,
      gapEnd: input.gapEnd,
      status: 'PENDING',
      bytesTransferred: 0,
      totalBytes,
      throttleKbps,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryJobs.set(id, job);
    return job;
  }

  /**
   * Updates replenishment progress of an active backfill transfer
   */
  async updateProgress(
    jobId: string,
    bytesTransferred: number,
    totalBytes: number,
    status: ReplenishmentStatus = 'IN_PROGRESS',
    errorMessage?: string
  ): Promise<boolean> {
    const now = new Date();
    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE edge_replenishment_jobs
         SET bytes_transferred = $1, total_bytes = $2, status = $3, error_message = $4, updated_at = $5
         WHERE id = $6`,
        [bytesTransferred, totalBytes, status, errorMessage || null, now, jobId]
      );
      return (res.rowCount ?? 0) > 0;
    }

    const job = this.inMemoryJobs.get(jobId);
    if (job) {
      job.bytesTransferred = bytesTransferred;
      job.totalBytes = totalBytes;
      job.status = status;
      if (errorMessage) job.errorMessage = errorMessage;
      job.updatedAt = now;
      return true;
    }
    return false;
  }

  /**
   * Lists replenishment jobs with optional status filter
   */
  async listJobs(tenantId: string, status?: ReplenishmentStatus): Promise<EdgeReplenishmentJob[]> {
    if (this.pool) {
      let query = `SELECT * FROM edge_replenishment_jobs WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC LIMIT 100`;

      const res = await this.pool.query(query, params);
      return res.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        cameraId: row.camera_id,
        gapStart: new Date(row.gap_start),
        gapEnd: new Date(row.gap_end),
        status: row.status as ReplenishmentStatus,
        bytesTransferred: Number(row.bytes_transferred),
        totalBytes: Number(row.total_bytes),
        throttleKbps: Number(row.throttle_kbps),
        errorMessage: row.error_message,
        retryCount: Number(row.retry_count),
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      }));
    }

    return Array.from(this.inMemoryJobs.values())
      .filter((j) => j.tenantId === tenantId && (!status || j.status === status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
