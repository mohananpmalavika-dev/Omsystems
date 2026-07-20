import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { RecordingJob, RecordingSegment } from "../domain/models.js";

export class RecordingRepository {
  constructor(private readonly pool: Pool) {}

  async getJob(cameraId: string): Promise<RecordingJob | undefined> {
    const result = await this.pool.query("SELECT * FROM recording_jobs WHERE camera_id=$1", [cameraId]);
    return result.rows[0] ? mapJob(result.rows[0]) : undefined;
  }

  async upsertJob(cameraId: string, input: Omit<RecordingJob, "id" | "cameraId" | "updatedAt">) {
    const result = await this.pool.query(
      `INSERT INTO recording_jobs (id, camera_id, mode, enabled, status, retention_days, schedule, post_roll_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (camera_id) DO UPDATE SET mode=EXCLUDED.mode, enabled=EXCLUDED.enabled,
       status=EXCLUDED.status, retention_days=EXCLUDED.retention_days, schedule=EXCLUDED.schedule,
       post_roll_seconds=EXCLUDED.post_roll_seconds, updated_at=now() RETURNING *`,
      [randomUUID(), cameraId, input.mode, input.enabled, input.status, input.retentionDays,
        input.schedule ? JSON.stringify(input.schedule) : null, input.postRollSeconds],
    );
    return mapJob(result.rows[0]);
  }

  async listSegments(cameraId: string, from?: string, to?: string): Promise<RecordingSegment[]> {
    const result = await this.pool.query(
      `SELECT * FROM recording_segments WHERE camera_id=$1
       AND ($2::timestamptz IS NULL OR ended_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR started_at <= $3::timestamptz)
       ORDER BY started_at DESC`, [cameraId, from ?? null, to ?? null],
    );
    return result.rows.map(mapSegment);
  }

  async createSegment(input: Omit<RecordingSegment, "id">) {
    const result = await this.pool.query(
      `INSERT INTO recording_segments (id, camera_id, job_id, started_at, ended_at, storage_path, size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [randomUUID(), input.cameraId, input.jobId, input.startedAt, input.endedAt, input.storagePath, input.sizeBytes],
    );
    return mapSegment(result.rows[0]);
  }
}

function mapJob(row: any): RecordingJob {
  return { id: row.id, cameraId: row.camera_id, mode: row.mode, enabled: row.enabled,
    status: row.status, retentionDays: row.retention_days, schedule: row.schedule ?? undefined,
    postRollSeconds: row.post_roll_seconds, updatedAt: new Date(row.updated_at).toISOString() };
}
function mapSegment(row: any): RecordingSegment {
  return { id: row.id, cameraId: row.camera_id, jobId: row.job_id,
    startedAt: new Date(row.started_at).toISOString(), endedAt: new Date(row.ended_at).toISOString(),
    storagePath: row.storage_path, sizeBytes: Number(row.size_bytes) };
}
